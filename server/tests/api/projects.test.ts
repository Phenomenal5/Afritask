// API: projects — create/list/get/update, archive/restore, read-only archived work.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createProject, createTask, createTeam } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

describe("creating and listing projects", () => {
    it.each([["owner", 201], ["admin", 201], ["member", 403], ["outsider", 404]] as const)("%s creating → %i", async (who, status) => {
        const team = await createTeam();
        const response = await team[who].client.post(`/workspaces/${team.workspace.id}/projects`, { name: "Website" });
        expect(response.status).toBe(status);
    });

    it("validates the name", async () => {
        const team = await createTeam();
        const response = await team.owner.client.post(`/workspaces/${team.workspace.id}/projects`, { name: " " });
        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Project name is required");
    });

    it("every member can list, with task counts; archived only on request", async () => {
        const team = await createTeam();
        const project = await createProject(team.workspace.id, team.owner.user.id);
        await createProject(team.workspace.id, team.owner.user.id, { name: "Old", state: "archived" });
        await createTask(team.workspace.id, team.owner.user.id, { projectId: project.id });
        await createTask(team.workspace.id, team.owner.user.id, { projectId: project.id, status: "completed" });

        const list = await team.member.client.get(`/workspaces/${team.workspace.id}/projects`);
        expect(list.status).toBe(200);
        expect(list.body.data.projects).toEqual([expect.objectContaining({ id: project.id, taskCounts: { total: 2, completed: 1, open: 1 } })]);

        const withArchived = await team.member.client.get(`/workspaces/${team.workspace.id}/projects?includeArchived=true`);
        expect(withArchived.body.results).toBe(2);
    });

    it("GET /projects/:id tells the caller whether they can manage it", async () => {
        const team = await createTeam();
        const project = await createProject(team.workspace.id, team.owner.user.id);
        await expect(team.admin.client.get(`/projects/${project.id}`)).resolves.toMatchObject({ body: { data: { project: { canManage: true } } } });
        await expect(team.member.client.get(`/projects/${project.id}`)).resolves.toMatchObject({ body: { data: { project: { canManage: false } } } });
        await expect(team.outsider.client.get(`/projects/${project.id}`)).resolves.toMatchObject({ status: 404 });
    });
});

describe("project lifecycle", () => {
    it("completing a project leaves its tasks untouched (PRD FR05)", async () => {
        const team = await createTeam();
        const project = await createProject(team.workspace.id, team.owner.user.id);
        const task = await createTask(team.workspace.id, team.owner.user.id, { projectId: project.id });

        const response = await team.owner.client.patch(`/projects/${project.id}`, { state: "completed" });
        expect(response.status).toBe(200);
        expect(response.body.data.project.taskCounts.open).toBe(1);
        await expect(prisma.task.findUniqueOrThrow({ where: { id: task.id } })).resolves.toMatchObject({ status: "todo" });
    });

    it("state can't be set to archived via PATCH, nor to nonsense", async () => {
        const team = await createTeam();
        const project = await createProject(team.workspace.id, team.owner.user.id);
        await expect(team.owner.client.patch(`/projects/${project.id}`, { state: "archived" })).resolves.toMatchObject({ status: 400 });
        await expect(team.owner.client.patch(`/projects/${project.id}`, { state: "deleted" })).resolves.toMatchObject({ status: 400 });
    });

    it("members can't edit, archive or restore", async () => {
        const team = await createTeam();
        const project = await createProject(team.workspace.id, team.owner.user.id);
        await expect(team.member.client.patch(`/projects/${project.id}`, { name: "x" })).resolves.toMatchObject({ status: 403 });
        await expect(team.member.client.post(`/projects/${project.id}/archive`)).resolves.toMatchObject({ status: 403 });
    });

    it("archive → restore returns to the state it had before (not always Active)", async () => {
        const team = await createTeam();
        const project = await createProject(team.workspace.id, team.owner.user.id, { state: "on_hold" });

        await expect(team.admin.client.post(`/projects/${project.id}/archive`)).resolves.toMatchObject({ status: 200 });
        await expect(team.admin.client.post(`/projects/${project.id}/archive`)).resolves.toMatchObject({ status: 409 });
        const restored = await team.admin.client.post(`/projects/${project.id}/restore`);
        expect(restored.body.data.project).toMatchObject({ state: "on_hold", priorState: null });
        await expect(team.admin.client.post(`/projects/${project.id}/restore`)).resolves.toMatchObject({ status: 409 });
    });

    it("an archived project and its tasks are read-only until restored", async () => {
        const team = await createTeam();
        const project = await createProject(team.workspace.id, team.owner.user.id, { state: "archived" });
        const task = await createTask(team.workspace.id, team.owner.user.id, { projectId: project.id });

        await expect(team.owner.client.patch(`/projects/${project.id}`, { name: "x" })).resolves.toMatchObject({ status: 409 });
        await expect(team.owner.client.put(`/tasks/${task.id}`, { title: "x", version: 1 })).resolves.toMatchObject({ status: 409 });
        await expect(team.owner.client.patch(`/tasks/${task.id}/status`, { status: "completed", completionNote: "Done", version: 1 })).resolves.toMatchObject({ status: 409 });
        await expect(team.owner.client.delete(`/tasks/${task.id}`)).resolves.toMatchObject({ status: 409 });
        await expect(team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "new", projectId: project.id })).resolves.toMatchObject({ status: 409 });
        // …but still readable, by project:
        await expect(team.member.client.get(`/workspaces/${team.workspace.id}/tasks?projectId=${project.id}`)).resolves.toMatchObject({ body: { results: 1 } });
    });

    it("workspace task lists leave out archived projects' tasks", async () => {
        const team = await createTeam();
        const archived = await createProject(team.workspace.id, team.owner.user.id, { state: "archived" });
        await createTask(team.workspace.id, team.owner.user.id, { projectId: archived.id });
        await createTask(team.workspace.id, team.owner.user.id);
        await expect(team.owner.client.get(`/workspaces/${team.workspace.id}/tasks`)).resolves.toMatchObject({ body: { results: 1 } });
    });
});
