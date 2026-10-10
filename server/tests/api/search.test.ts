// API: search, combined filters and pagination (SRS SR13).
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createProject, createTask, createTeam } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

type Listed = { title: string };
const titlesOf = (response: { body: { data: { tasks: Listed[] } } }) => response.body.data.tasks.map((task) => task.title).sort();

describe("search", () => {
    it("matches titles, descriptions and project names, ignoring case", async () => {
        const team = await createTeam();
        const website = await createProject(team.workspace.id, team.owner.user.id, { name: "Website Refresh" });
        await createTask(team.workspace.id, team.owner.user.id, { title: "Invoice Client" });
        const described = await createTask(team.workspace.id, team.owner.user.id, { title: "Call Ada" });
        await prisma.task.update({ where: { id: described.id }, data: { description: "about the INVOICE dispute" } });
        await createTask(team.workspace.id, team.owner.user.id, { title: "Hero image", projectId: website.id });
        await createTask(team.workspace.id, team.owner.user.id, { title: "Unrelated" });

        const byText = await team.member.client.get(`/workspaces/${team.workspace.id}/tasks?q=invoice`);
        expect(titlesOf(byText)).toEqual(["Call Ada", "Invoice Client"]);
        const byProject = await team.member.client.get(`/workspaces/${team.workspace.id}/tasks?q=website`);
        expect(titlesOf(byProject)).toEqual(["Hero image"]);
        const projects = await team.member.client.get(`/workspaces/${team.workspace.id}/projects?q=REFRESH`);
        expect(projects.body.data.projects.map((project: { name: string }) => project.name)).toEqual(["Website Refresh"]);
    });

    it("finds matching subtasks, with their parent", async () => {
        const team = await createTeam();
        const parent = await createTask(team.workspace.id, team.owner.user.id, { title: "Launch" });
        await team.owner.client.post(`/tasks/${parent.id}/subtasks`, { title: "Draft press release" });

        const response = await team.owner.client.get(`/workspaces/${team.workspace.id}/tasks?q=press`);
        expect(response.body.data.tasks).toMatchObject([{ title: "Draft press release", parent: { title: "Launch" } }]);
    });

    it("never returns another workspace's work", async () => {
        const team = await createTeam();
        const otherTeam = await createTeam();
        await createTask(otherTeam.workspace.id, otherTeam.owner.user.id, { title: "Secret roadmap" });

        const response = await team.owner.client.get(`/workspaces/${team.workspace.id}/tasks?q=roadmap`);
        expect(response.body.data.tasks).toEqual([]);
        // Filtering by the other workspace's project id can't widen the search either.
        const foreignProject = await createProject(otherTeam.workspace.id, otherTeam.owner.user.id);
        await createTask(otherTeam.workspace.id, otherTeam.owner.user.id, { title: "Foreign", projectId: foreignProject.id });
        const byForeignProject = await team.owner.client.get(`/workspaces/${team.workspace.id}/tasks?projectId=${foreignProject.id}`);
        expect(byForeignProject.body.data.tasks).toEqual([]);
    });
});

describe("combined filters", () => {
    it("ORs values within a filter and ANDs across filters, including unassigned and no project", async () => {
        const team = await createTeam();
        const project = await createProject(team.workspace.id, team.owner.user.id);
        await createTask(team.workspace.id, team.owner.user.id, { title: "A", status: "todo" });
        await createTask(team.workspace.id, team.owner.user.id, { title: "B", status: "in_review", assigneeMembershipId: team.member.membership.id });
        await createTask(team.workspace.id, team.owner.user.id, { title: "C", status: "completed" });
        await createTask(team.workspace.id, team.owner.user.id, { title: "D", status: "todo", projectId: project.id });

        const base = `/workspaces/${team.workspace.id}/tasks`;
        expect(titlesOf(await team.owner.client.get(`${base}?status=todo,in_review`))).toEqual(["A", "B", "D"]);
        expect(titlesOf(await team.owner.client.get(`${base}?status=todo&status=in_review&projectId=none`))).toEqual(["A", "B"]);
        expect(titlesOf(await team.owner.client.get(`${base}?status=todo,in_review&assignee=none`))).toEqual(["A", "D"]);
        expect(titlesOf(await team.owner.client.get(`${base}?assignee=none,${team.member.membership.id}&projectId=none`))).toEqual(["A", "B", "C"]);
        expect(titlesOf(await team.owner.client.get(`${base}?projectId=none,${project.id}&status=todo`))).toEqual(["A", "D"]);
    });

    it("rejects malformed filter values instead of silently ignoring them", async () => {
        const team = await createTeam();
        const base = `/workspaces/${team.workspace.id}/tasks`;
        await expect(team.owner.client.get(`${base}?status=done`)).resolves.toMatchObject({ status: 400 });
        await expect(team.owner.client.get(`${base}?assignee=someone`)).resolves.toMatchObject({ status: 400 });
        await expect(team.owner.client.get(`${base}?projectId=abc`)).resolves.toMatchObject({ status: 400 });
    });
});

describe("pagination", () => {
    it("walks every task exactly once in a stable order", async () => {
        const team = await createTeam();
        for (let index = 1; index <= 7; index++) {
            await createTask(team.workspace.id, team.owner.user.id, { title: `Task ${index}` });
        }

        const seen: string[] = [];
        for (let page = 1; page <= 3; page++) {
            const response = await team.owner.client.get(`/workspaces/${team.workspace.id}/tasks?sort=title&limit=3&page=${page}`);
            expect(response.body.data.pagination).toEqual({ page, limit: 3, total: 7, totalPages: 3 });
            seen.push(...response.body.data.tasks.map((task: Listed) => task.title));
        }
        expect(seen).toEqual(["Task 1", "Task 2", "Task 3", "Task 4", "Task 5", "Task 6", "Task 7"]);

        // Same request again → same page.
        const again = await team.owner.client.get(`/workspaces/${team.workspace.id}/tasks?sort=title&limit=3&page=2`);
        expect(again.body.data.tasks.map((task: Listed) => task.title)).toEqual(["Task 4", "Task 5", "Task 6"]);
    });

    it("an empty page keeps the paging info; bad limits are refused", async () => {
        const team = await createTeam();
        const empty = await team.owner.client.get(`/workspaces/${team.workspace.id}/tasks?q=nothing&limit=10`);
        expect(empty.body.data).toMatchObject({ tasks: [], pagination: { page: 1, total: 0, totalPages: 1 } });
        await expect(team.owner.client.get(`/workspaces/${team.workspace.id}/tasks?limit=500`)).resolves.toMatchObject({ status: 400 });
        await expect(team.owner.client.get(`/workspaces/${team.workspace.id}/tasks?limit=10&page=0`)).resolves.toMatchObject({ status: 400 });
    });
});
