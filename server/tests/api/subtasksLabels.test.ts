// API: subtasks (one level) and workspace labels (PRD FR07).
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { addMember, createProject, createSignedInUser, createTask, createTeam } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

describe("subtasks", () => {
    it("any member adds a subtask; it inherits workspace + project and has its own assignee", async () => {
        const team = await createTeam();
        const project = await createProject(team.workspace.id, team.owner.user.id);
        const parent = await createTask(team.workspace.id, team.owner.user.id, { title: "Production release", projectId: project.id });

        const response = await team.member.client.post(`/tasks/${parent.id}/subtasks`, { title: "Deploy frontend", assigneeMembershipId: team.admin.membership.id });
        expect(response.status).toBe(201);
        expect(response.body.data.task).toMatchObject({
            parentTaskId: parent.id,
            workspaceId: team.workspace.id,
            projectId: project.id,
            creatorId: team.member.user.id,
            parent: { id: parent.id, title: "Production release" },
            assignee: { id: team.admin.membership.id },
        });
    });

    it("refuses a subtask of a subtask (one level only)", async () => {
        const team = await createTeam();
        const parent = await createTask(team.workspace.id, team.owner.user.id);
        const child = await team.owner.client.post(`/tasks/${parent.id}/subtasks`, { title: "child" });
        const grandchild = await team.owner.client.post(`/tasks/${child.body.data.task.id}/subtasks`, { title: "grandchild" });
        expect(grandchild.status).toBe(400);
        expect(grandchild.body.message).toBe("Subtasks can't have their own subtasks");
    });

    it("outsiders can't add subtasks; archived parents refuse them", async () => {
        const team = await createTeam();
        const archived = await createProject(team.workspace.id, team.owner.user.id, { state: "archived" });
        const parent = await createTask(team.workspace.id, team.owner.user.id);
        const archivedParent = await createTask(team.workspace.id, team.owner.user.id, { projectId: archived.id });
        await expect(team.outsider.client.post(`/tasks/${parent.id}/subtasks`, { title: "x" })).resolves.toMatchObject({ status: 404 });
        await expect(team.owner.client.post(`/tasks/${archivedParent.id}/subtasks`, { title: "x" })).resolves.toMatchObject({ status: 409 });
    });

    it("the parent shows progress; the detail view lists the subtasks", async () => {
        const team = await createTeam();
        const parent = await createTask(team.workspace.id, team.owner.user.id);
        await team.owner.client.post(`/tasks/${parent.id}/subtasks`, { title: "a", status: "completed" });
        await team.owner.client.post(`/tasks/${parent.id}/subtasks`, { title: "b" });

        const detail = await team.owner.client.get(`/tasks/${parent.id}`);
        expect(detail.body.data.task.subtaskCounts).toEqual({ total: 2, completed: 1 });
        expect(detail.body.data.task.subtasks.map((subtask: { title: string }) => subtask.title)).toEqual(["a", "b"]);
    });

    it("lists show top-level tasks; filtering by assignee includes their subtasks with parent context", async () => {
        const team = await createTeam();
        const parent = await createTask(team.workspace.id, team.owner.user.id, { title: "Parent" });
        await team.owner.client.post(`/tasks/${parent.id}/subtasks`, { title: "Mine", assigneeMembershipId: team.member.membership.id });

        await expect(team.member.client.get(`/workspaces/${team.workspace.id}/tasks`)).resolves.toMatchObject({ body: { results: 1 } });
        const mine = await team.member.client.get(`/workspaces/${team.workspace.id}/tasks?assignee=me`);
        expect(mine.body.data.tasks).toEqual([expect.objectContaining({ title: "Mine", parent: { id: parent.id, title: "Parent" } })]);
        await expect(team.member.client.get(`/workspaces/${team.workspace.id}/tasks?includeSubtasks=true`)).resolves.toMatchObject({ body: { results: 2 } });
    });

    it("moving the parent to another project moves its subtasks; a subtask can't move alone", async () => {
        const team = await createTeam();
        const projectA = await createProject(team.workspace.id, team.owner.user.id, { name: "A" });
        const projectB = await createProject(team.workspace.id, team.owner.user.id, { name: "B" });
        const parent = await createTask(team.workspace.id, team.owner.user.id, { projectId: projectA.id });
        const child = (await team.owner.client.post(`/tasks/${parent.id}/subtasks`, { title: "child" })).body.data.task;

        await expect(team.owner.client.put(`/tasks/${child.id}`, { projectId: projectB.id, version: child.version })).resolves.toMatchObject({ status: 400 });
        await expect(team.owner.client.put(`/tasks/${parent.id}`, { projectId: projectB.id, version: 1 })).resolves.toMatchObject({ status: 200 });
        await expect(prisma.task.findUniqueOrThrow({ where: { id: child.id } })).resolves.toMatchObject({ projectId: projectB.id });
    });

    it("completing the parent leaves unfinished subtasks unfinished; deleting it removes them", async () => {
        const team = await createTeam();
        const parent = await createTask(team.workspace.id, team.owner.user.id);
        const child = (await team.owner.client.post(`/tasks/${parent.id}/subtasks`, { title: "child" })).body.data.task;

        const completed = await team.owner.client.patch(`/tasks/${parent.id}/status`, { status: "completed", completionNote: "Done", version: 1 });
        expect(completed.body.data.task.subtaskCounts).toEqual({ total: 1, completed: 0 });
        await expect(prisma.task.findUniqueOrThrow({ where: { id: child.id } })).resolves.toMatchObject({ status: "todo" });

        await expect(team.owner.client.delete(`/tasks/${parent.id}`)).resolves.toMatchObject({ status: 204 });
        await expect(prisma.task.findUnique({ where: { id: child.id } })).resolves.toBeNull();
    });

    it("subtask permissions are their own: the parent's assignee can't edit a child assigned to someone else", async () => {
        const team = await createTeam();
        const parentAssignee = await createSignedInUser();
        const parentAssigneeMembership = await addMember(team.workspace.id, parentAssignee.user.id);
        const parent = await createTask(team.workspace.id, team.owner.user.id, { assigneeMembershipId: parentAssigneeMembership.id });
        const child = (await team.owner.client.post(`/tasks/${parent.id}/subtasks`, { title: "child", assigneeMembershipId: team.member.membership.id })).body.data.task;

        await expect(parentAssignee.client.put(`/tasks/${child.id}`, { title: "x", version: child.version })).resolves.toMatchObject({ status: 403 });
        await expect(team.member.client.put(`/tasks/${child.id}`, { title: "x", version: child.version })).resolves.toMatchObject({ status: 200 });
    });

    it("project task counts ignore subtasks", async () => {
        const team = await createTeam();
        const project = await createProject(team.workspace.id, team.owner.user.id);
        const parent = await createTask(team.workspace.id, team.owner.user.id, { projectId: project.id });
        await team.owner.client.post(`/tasks/${parent.id}/subtasks`, { title: "child" });
        const projectNow = await team.owner.client.get(`/projects/${project.id}`);
        expect(projectNow.body.data.project.taskCounts.total).toBe(1);
    });
});

describe("labels", () => {
    it("Owners/Admins create labels; members see them; names are unique ignoring case", async () => {
        const team = await createTeam();
        const created = await team.admin.client.post(`/workspaces/${team.workspace.id}/labels`, { name: " Bug ", color: "clay" });
        expect(created.status).toBe(201);
        expect(created.body.data.label).toMatchObject({ name: "Bug", color: "clay" });

        await expect(team.owner.client.post(`/workspaces/${team.workspace.id}/labels`, { name: "bug" })).resolves.toMatchObject({ status: 409 });
        await expect(team.member.client.post(`/workspaces/${team.workspace.id}/labels`, { name: "Mine" })).resolves.toMatchObject({ status: 403 });
        await expect(team.member.client.get(`/workspaces/${team.workspace.id}/labels`)).resolves.toMatchObject({ body: { results: 1 } });
        await expect(team.outsider.client.get(`/workspaces/${team.workspace.id}/labels`)).resolves.toMatchObject({ status: 404 });
    });

    it.each([
        [{ name: "" }, "Label name is required"],
        [{ name: "x".repeat(41) }, "Label name must be 40 characters or fewer"],
        [{ name: "ok", color: "neon" }, "Color must be one of: gray, moss, clay, gold, sky, plum"],
    ])("rejects %p", async (body, message) => {
        const team = await createTeam();
        const response = await team.owner.client.post(`/workspaces/${team.workspace.id}/labels`, body);
        expect(response.status).toBe(400);
        expect(response.body.message).toBe(message);
    });

    it("applying labels: creators/assignees may, bystanders may not; other workspaces' labels are refused", async () => {
        const team = await createTeam();
        const other = await createTeam();
        const bug = (await team.owner.client.post(`/workspaces/${team.workspace.id}/labels`, { name: "Bug" })).body.data.label;
        const foreign = (await other.owner.client.post(`/workspaces/${other.workspace.id}/labels`, { name: "Foreign" })).body.data.label;
        const task = await createTask(team.workspace.id, team.member.user.id);

        const applied = await team.member.client.put(`/tasks/${task.id}`, { labelIds: [bug.id, bug.id], version: 1 });
        expect(applied.status).toBe(200);
        expect(applied.body.data.task.labels).toEqual([{ id: bug.id, name: "Bug", color: "gray" }]);

        await expect(team.member.client.put(`/tasks/${task.id}`, { labelIds: [foreign.id], version: 2 })).resolves.toMatchObject({ status: 400 });
        const bystander = await createSignedInUser();
        await addMember(team.workspace.id, bystander.user.id);
        await expect(bystander.client.put(`/tasks/${task.id}`, { labelIds: [], version: 2 })).resolves.toMatchObject({ status: 403 });
    });

    it("labels on create, filter by label, and an empty list clears them", async () => {
        const team = await createTeam();
        const urgent = (await team.owner.client.post(`/workspaces/${team.workspace.id}/labels`, { name: "Client" })).body.data.label;
        const tagged = (await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "tagged", labelIds: [urgent.id] })).body.data.task;
        await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "plain" });

        const filtered = await team.owner.client.get(`/workspaces/${team.workspace.id}/tasks?labelId=${urgent.id}`);
        expect(filtered.body.data.tasks.map((task: { title: string }) => task.title)).toEqual(["tagged"]);
        const cleared = await team.owner.client.put(`/tasks/${tagged.id}`, { labelIds: [], version: tagged.version });
        expect(cleared.body.data.task.labels).toEqual([]);
    });

    it("renaming is Owner/Admin only; deleting a label keeps the tasks", async () => {
        const team = await createTeam();
        const label = (await team.owner.client.post(`/workspaces/${team.workspace.id}/labels`, { name: "Old" })).body.data.label;
        const task = (await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "kept", labelIds: [label.id] })).body.data.task;

        await expect(team.member.client.patch(`/labels/${label.id}`, { name: "x" })).resolves.toMatchObject({ status: 403 });
        await expect(team.outsider.client.patch(`/labels/${label.id}`, { name: "x" })).resolves.toMatchObject({ status: 404 });
        await expect(team.admin.client.patch(`/labels/${label.id}`, { name: "New", color: "sky" })).resolves.toMatchObject({ status: 200, body: { data: { label: { name: "New", color: "sky" } } } });

        await expect(team.admin.client.delete(`/labels/${label.id}`)).resolves.toMatchObject({ status: 204 });
        const taskNow = await team.owner.client.get(`/tasks/${task.id}`);
        expect(taskNow.status).toBe(200);
        expect(taskNow.body.data.task.labels).toEqual([]);
    });
});
