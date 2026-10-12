// API: moving a due date LATER is an extension — counted on the task, logged with an
// optional reason (shown in history), and attributed to whoever owns the task.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createTeam } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

const DAY_MS = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

const createTaskDueIn = async (team: Awaited<ReturnType<typeof createTeam>>, days: number) => {
    const response = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Quarterly report", dueAt: inDays(days), assigneeMembershipId: team.member.membership.id });
    expect(response.status).toBe(201);
    return response.body.data.task;
};

describe("due date extensions", () => {
    it("records the original due date at creation", async () => {
        const team = await createTeam();
        const task = await createTaskDueIn(team, 3);
        const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
        expect(stored.originalDueAt?.toISOString()).toBe(task.dueAt);
        expect(stored.dueExtensionCount).toBe(0);
    });

    it("moving it later is an extension: counted, logged with the reason, shown in history", async () => {
        const team = await createTeam();
        const task = await createTaskDueIn(team, 3);

        const extended = await team.owner.client.put(`/tasks/${task.id}`, { dueAt: inDays(7), dueChangeReason: "  Waiting on the client's figures  ", version: task.version });
        expect(extended.status).toBe(200);

        const stored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
        expect(stored.dueExtensionCount).toBe(1);
        expect(stored.originalDueAt?.toISOString()).toBe(task.dueAt);

        const [extension] = await prisma.dueDateExtension.findMany({ where: { taskId: task.id } });
        expect(extension).toMatchObject({
            reason: "Waiting on the client's figures",
            extendedById: team.owner.user.id,
            // It's the assignee's task, whoever moved the date.
            responsibleUserId: team.member.user.id,
        });
        expect(extension!.fromDueAt.toISOString()).toBe(task.dueAt);

        const history = await team.owner.client.get(`/tasks/${task.id}/activity`);
        expect(history.body.data.entries[0].changes.dueChangeReason).toEqual({ from: null, to: "Waiting on the client's figures" });
    });

    it("the reason is optional", async () => {
        const team = await createTeam();
        const task = await createTaskDueIn(team, 3);
        await expect(team.owner.client.put(`/tasks/${task.id}`, { dueAt: inDays(5), version: task.version })).resolves.toMatchObject({ status: 200 });
        const [extension] = await prisma.dueDateExtension.findMany({ where: { taskId: task.id } });
        expect(extension!.reason).toBeNull();
    });

    it("bringing it forward, clearing it, or setting a first date is not an extension", async () => {
        const team = await createTeam();
        const task = await createTaskDueIn(team, 5);
        await team.owner.client.put(`/tasks/${task.id}`, { dueAt: inDays(2), dueChangeReason: "ignored", version: task.version });
        await team.owner.client.put(`/tasks/${task.id}`, { dueAt: null, version: task.version + 1 });
        await team.owner.client.put(`/tasks/${task.id}`, { dueAt: inDays(9), version: task.version + 2 });

        expect(await prisma.dueDateExtension.count()).toBe(0);
        await expect(prisma.task.findUniqueOrThrow({ where: { id: task.id } })).resolves.toMatchObject({ dueExtensionCount: 0 });
    });

    it("validates the reason", async () => {
        const team = await createTeam();
        const task = await createTaskDueIn(team, 3);
        await expect(team.owner.client.put(`/tasks/${task.id}`, { dueAt: inDays(6), dueChangeReason: "x".repeat(501), version: task.version })).resolves.toMatchObject({ status: 400 });
        await expect(team.owner.client.put(`/tasks/${task.id}`, { dueAt: inDays(6), dueChangeReason: { not: "" }, version: task.version })).resolves.toMatchObject({ status: 400 });
    });
});

describe("timing changes once work has started", () => {
    const startWork = async (team: Awaited<ReturnType<typeof createTeam>>, task: { id: string; version: number }) => {
        const moved = await team.member.client.patch(`/tasks/${task.id}/status`, { status: "in_progress", version: task.version });
        expect(moved.status).toBe(200);
        return moved.body.data.task as { id: string; version: number };
    };

    it("Members and Admins must say why; the reason shows in history", async () => {
        const team = await createTeam();
        const task = await startWork(team, await createTaskDueIn(team, 3));

        const silentMember = await team.member.client.put(`/tasks/${task.id}`, { dueAt: inDays(6), version: task.version });
        expect(silentMember.status).toBe(400);
        expect(silentMember.body.code).toBe("timing_reason_required");
        const silentAdmin = await team.admin.client.put(`/tasks/${task.id}`, { startAt: inDays(1), dueChangeReason: "   ", version: task.version });
        expect(silentAdmin.body.code).toBe("timing_reason_required");

        const explained = await team.member.client.put(`/tasks/${task.id}`, { dueAt: inDays(2), dueChangeReason: "Client moved the review up", version: task.version });
        expect(explained.status).toBe(200);
        const history = await team.owner.client.get(`/tasks/${task.id}/activity`);
        expect(history.body.data.entries[0].changes.dueChangeReason).toEqual({ from: null, to: "Client moved the review up" });
    });

    it("the Owner doesn't need a reason, nor does anyone while the task is still To do", async () => {
        const team = await createTeam();
        const todo = await createTaskDueIn(team, 3);
        await expect(team.member.client.put(`/tasks/${todo.id}`, { dueAt: inDays(4), version: todo.version })).resolves.toMatchObject({ status: 200 });

        const started = await startWork(team, { id: todo.id, version: todo.version + 1 });
        await expect(team.owner.client.put(`/tasks/${started.id}`, { dueAt: inDays(8), version: started.version })).resolves.toMatchObject({ status: 200 });
        // Re-sending the same time, or editing something else, isn't a timing change.
        const unchanged = await prisma.task.findUniqueOrThrow({ where: { id: started.id } });
        await expect(team.member.client.put(`/tasks/${started.id}`, { title: "Quarterly report v2", dueAt: unchanged.dueAt!.toISOString(), version: unchanged.version })).resolves.toMatchObject({ status: 200 });
    });
});
