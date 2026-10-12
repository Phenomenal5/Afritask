// API: tasks — create/read/update/delete, permissions, versioning, idempotency, due dates, filters.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { addMember, createProject, createSignedInUser, createTask, createTeam } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

describe("POST /workspaces/:id/tasks", () => {
    it("creates a title-only task with V1 defaults", async () => {
        const team = await createTeam();
        const response = await team.member.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "  Quick one  " });
        expect(response.status).toBe(201);
        expect(response.body.data.task).toMatchObject({
            title: "Quick one",
            status: "todo",
            priority: "medium",
            version: 1,
            projectId: null,
            assigneeMembershipId: null,
            completedAt: null,
            creatorId: team.member.user.id,
        });
    });

    it("accepts legacy statuses from older clients", async () => {
        const team = await createTeam();
        const pending = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "a", status: "pending" });
        const inProgress = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "b", status: "in progress" });
        expect(pending.body.data.task.status).toBe("todo");
        expect(inProgress.body.data.task.status).toBe("in_progress");
    });

    it.each([
        [{}, "Give the task a title."],
        [{ title: "x".repeat(201) }, "Keep the title to 200 characters or fewer. Put the rest in the description."],
        [{ title: "x", description: "d".repeat(20_001) }, "The description is too long. Keep it to 20,000 characters or fewer."],
        [{ title: "x", status: "done" }, "Choose a status: To do, In progress, In review or Completed."],
        [{ title: "x", priority: "critical" }, "Choose a priority: Low, Medium, High or Urgent."],
        [{ title: "x", dueDate: "2026-02-30" }, "That due date isn't a real date. Pick one from the calendar."],
    ])("rejects %p", async (body, message) => {
        const team = await createTeam();
        const response = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, body);
        expect(response.status).toBe(400);
        expect(response.body.message).toBe(message);
    });

    it("resolves a date-only deadline in the creator's timezone (PRD §9)", async () => {
        const team = await createTeam();
        await prisma.user.update({ where: { id: team.owner.user.id }, data: { timezone: "Africa/Lagos" } });
        const response = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "x", dueDate: "2026-12-01" });
        expect(response.body.data.task).toMatchObject({ dueAt: "2026-12-01T22:59:00.000Z", dueKind: "date", dueTimezone: "Africa/Lagos" });
    });

    it("sets completedAt when created already completed", async () => {
        const team = await createTeam();
        const response = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "x", status: "completed", completionNote: "Shipped it" });
        expect(response.body.data.task.completedAt).not.toBeNull();
    });

    it("assignee must be an ACTIVE member of THIS workspace", async () => {
        const team = await createTeam();
        const other = await createTeam();
        const ok = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "x", assigneeMembershipId: team.member.membership.id });
        expect(ok.body.data.task.assignee.user.name).toBe("Musa Member");

        const foreign = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "x", assigneeMembershipId: other.member.membership.id });
        expect(foreign.status).toBe(400);

        await prisma.membership.update({ where: { id: team.admin.membership.id }, data: { status: "removed" } });
        const removed = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "x", assigneeMembershipId: team.admin.membership.id });
        expect(removed.status).toBe(400);
    });

    it("project must be in the same workspace", async () => {
        const team = await createTeam();
        const other = await createTeam();
        const foreignProject = await createProject(other.workspace.id, other.owner.user.id);
        const response = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "x", projectId: foreignProject.id });
        expect(response.status).toBe(400);
        expect(response.body.message).toBe("That project was deleted or isn't in this workspace. Refresh to see the latest.");
    });

    it("is idempotent per clientRequestId — even for simultaneous submits", async () => {
        const team = await createTeam();
        const submit = () => team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Once", clientRequestId: "form-123" });
        const responses = await Promise.all([submit(), submit(), submit()]);
        const ids = new Set(responses.map((response) => response.body.data.task.id));
        expect(ids.size).toBe(1);
        expect(responses.map((response) => response.status).sort()).toEqual([200, 200, 201]);
        expect(await prisma.task.count({ where: { clientRequestId: "form-123" } })).toBe(1);
    });
});

describe("permissions on existing tasks (PRD §8)", () => {
    // The task is created by the Member and assigned to a second plain Member, so each
    // actor's right comes from exactly one source (role, authorship or assignment).
    const setupMatrix = async () => {
        const team = await createTeam();
        const assignee = await createSignedInUser({ name: "Asha Assignee" });
        const bystander = await createSignedInUser({ name: "Bola Bystander" });
        const assigneeMembership = await addMember(team.workspace.id, assignee.user.id, "member");
        await addMember(team.workspace.id, bystander.user.id, "member");
        const task = await createTask(team.workspace.id, team.member.user.id, { assigneeMembershipId: assigneeMembership.id });
        const actors = {
            owner: team.owner.client,
            admin: team.admin.client,
            creator: team.member.client,
            assignee: assignee.client,
            bystander: bystander.client,
            outsider: team.outsider.client,
        };
        return { task, actors };
    };

    it.each([
        ["owner", 200], ["admin", 200], ["creator", 200], ["assignee", 200], ["bystander", 403], ["outsider", 404],
    ] as const)("%s editing → %i", async (who, status) => {
        const { task, actors } = await setupMatrix();
        const response = await actors[who].put(`/tasks/${task.id}`, { title: "edited", version: 1 });
        expect(response.status).toBe(status);
    });

    it.each([
        ["owner", 204], ["admin", 204], ["creator", 204], ["assignee", 403], ["bystander", 403], ["outsider", 404],
    ] as const)("%s deleting → %i", async (who, status) => {
        const { task, actors } = await setupMatrix();
        const response = await actors[who].delete(`/tasks/${task.id}`);
        expect(response.status).toBe(status);
    });

    it("assignees can't delete; creators can", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.member.user.id, { assigneeMembershipId: team.admin.membership.id });
        await prisma.membership.update({ where: { id: team.admin.membership.id }, data: { role: "member" } });
        await expect(team.admin.client.delete(`/tasks/${task.id}`)).resolves.toMatchObject({ status: 403 });
        await expect(team.member.client.delete(`/tasks/${task.id}`)).resolves.toMatchObject({ status: 204 });
        await expect(team.member.client.get(`/tasks/${task.id}`)).resolves.toMatchObject({ status: 404 });
    });

    it("an assignee who hands the task to someone else loses edit rights", async () => {
        const team = await createTeam();
        await prisma.membership.update({ where: { id: team.admin.membership.id }, data: { role: "member" } });
        const task = await createTask(team.workspace.id, team.owner.user.id, { assigneeMembershipId: team.admin.membership.id });

        const handOff = await team.admin.client.put(`/tasks/${task.id}`, { assigneeMembershipId: team.member.membership.id, version: 1 });
        expect(handOff.status).toBe(200);
        await expect(team.admin.client.put(`/tasks/${task.id}`, { title: "mine again?", version: 2 })).resolves.toMatchObject({ status: 403 });
    });

    it("a bystander member can't reassign", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);
        const response = await team.member.client.put(`/tasks/${task.id}`, { assigneeMembershipId: team.member.membership.id, version: 1 });
        expect(response.status).toBe(403);
    });
});

describe("versioning and completion", () => {
    it("requires the version and rejects stale edits with 409 (SRS SR06)", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);

        await expect(team.owner.client.put(`/tasks/${task.id}`, { title: "no version" })).resolves.toMatchObject({ status: 400 });
        const first = await team.owner.client.put(`/tasks/${task.id}`, { title: "first", version: 1 });
        expect(first.body.data.task.version).toBe(2);
        const stale = await team.admin.client.put(`/tasks/${task.id}`, { title: "stale overwrite", version: 1 });
        expect(stale.status).toBe(409);
        await expect(prisma.task.findUniqueOrThrow({ where: { id: task.id } })).resolves.toMatchObject({ title: "first" });
    });

    it("two simultaneous edits of the same version: one wins, one gets 409", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);
        const responses = await Promise.all([
            team.owner.client.put(`/tasks/${task.id}`, { title: "A", version: 1 }),
            team.admin.client.put(`/tasks/${task.id}`, { title: "B", version: 1 }),
        ]);
        expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    });

    it("completing records completedAt; reopening clears it", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);
        const completed = await team.owner.client.patch(`/tasks/${task.id}/status`, { status: "completed", completionNote: "Done", version: 1 });
        expect(completed.body.data.task.completedAt).not.toBeNull();
        const reopened = await team.owner.client.patch(`/tasks/${task.id}/status`, { status: "in_review", version: 2 });
        expect(reopened.body.data.task).toMatchObject({ status: "in_review", completedAt: null, version: 3 });
    });

    it("status PATCH needs a status and a version", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);
        await expect(team.owner.client.patch(`/tasks/${task.id}/status`, { version: 1 })).resolves.toMatchObject({ status: 400 });
        await expect(team.owner.client.patch(`/tasks/${task.id}/status`, { status: "completed", completionNote: "Done" })).resolves.toMatchObject({ status: 400 });
    });

    it("an untouched deadline survives an edit; null clears it", async () => {
        const team = await createTeam();
        const created = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "x", dueDate: "2026-12-01" });
        const taskId = created.body.data.task.id;
        const retitled = await team.owner.client.put(`/tasks/${taskId}`, { title: "y", version: 1 });
        expect(retitled.body.data.task.dueAt).toBe(created.body.data.task.dueAt);
        const cleared = await team.owner.client.put(`/tasks/${taskId}`, { dueDate: null, version: 2 });
        expect(cleared.body.data.task).toMatchObject({ dueAt: null, dueKind: null });
    });
});

describe("reading and filtering", () => {
    it("rejects malformed ids with 400 and unknown ids with 404", async () => {
        const team = await createTeam();
        await expect(team.owner.client.get("/tasks/not-a-uuid")).resolves.toMatchObject({ status: 400 });
        await expect(team.owner.client.get("/tasks/0199c3a0-0000-7000-8000-000000000000")).resolves.toMatchObject({ status: 404 });
    });

    it("filters by status, priority, assignee and project", async () => {
        const team = await createTeam();
        const project = await createProject(team.workspace.id, team.owner.user.id);
        await createTask(team.workspace.id, team.owner.user.id, { assigneeMembershipId: team.member.membership.id, projectId: project.id });
        await createTask(team.workspace.id, team.owner.user.id, { status: "completed" });
        await prisma.task.create({ data: { workspaceId: team.workspace.id, creatorId: team.owner.user.id, title: "urgent", priority: "urgent" } });
        const list = (query: string) => team.member.client.get(`/workspaces/${team.workspace.id}/tasks${query}`).then((response) => response.body.results);

        await expect(list("")).resolves.toBe(3);
        await expect(list("?status=completed")).resolves.toBe(1);
        await expect(list("?priority=urgent")).resolves.toBe(1);
        await expect(list("?assignee=me")).resolves.toBe(1);
        await expect(list("?assignee=none")).resolves.toBe(2);
        await expect(list(`?projectId=${project.id}`)).resolves.toBe(1);
        await expect(list("?projectId=none")).resolves.toBe(2);
    });

    it("sorts with a stable tie-breaker and ignores unknown sort fields", async () => {
        const team = await createTeam();
        for (const title of ["b", "a", "c"]) await createTask(team.workspace.id, team.owner.user.id, { title });
        const sorted = await team.owner.client.get(`/workspaces/${team.workspace.id}/tasks?sort=title`);
        expect(sorted.body.data.tasks.map((task: { title: string }) => task.title)).toEqual(["a", "b", "c"]);
        await expect(team.owner.client.get(`/workspaces/${team.workspace.id}/tasks?sort=password`)).resolves.toMatchObject({ status: 200 });
    });
});
