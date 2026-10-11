// API: per-task reminder choice and its schedule (SRS SR10).
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createTeam } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

const HOUR = 60 * 60 * 1000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();

describe("reminder choice", () => {
    it("defaults to one day before when a deadline is set, and schedules it", async () => {
        const team = await createTeam();
        const dueAt = inHours(72);
        const created = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Report", dueAt });

        expect(created.body.data.task).toMatchObject({ reminderOffset: "one_day", overdueCheckAt: new Date(dueAt).toISOString() });
        expect(new Date(created.body.data.task.remindAt).getTime()).toBe(new Date(dueAt).getTime() - 24 * HOUR);

        const undated = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Someday" });
        expect(undated.body.data.task).toMatchObject({ reminderOffset: null, remindAt: null, overdueCheckAt: null });
    });

    it("accepts an explicit choice or none, and rejects unknown ones", async () => {
        const team = await createTeam();
        const chosen = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "A", dueAt: inHours(10), reminderOffset: "one_hour" });
        expect(chosen.body.data.task.reminderOffset).toBe("one_hour");

        const none = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "B", dueAt: inHours(10), reminderOffset: "none" });
        expect(none.body.data.task).toMatchObject({ reminderOffset: null, remindAt: null });

        const invalid = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "C", dueAt: inHours(10), reminderOffset: "two_days" });
        expect(invalid.status).toBe(400);
    });

    it("a reminder time that already passed is not scheduled", async () => {
        const team = await createTeam();
        // Due in 2 hours with "1 day before": that moment is in the past.
        const created = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Soon", dueAt: inHours(2), reminderOffset: "one_day" });
        expect(created.body.data.task).toMatchObject({ reminderOffset: "one_day", remindAt: null });
        expect(created.body.data.task.overdueCheckAt).not.toBeNull();
    });
});

describe("re-planning", () => {
    it("moving the deadline re-plans; an unrelated edit doesn't re-arm a fired reminder", async () => {
        const team = await createTeam();
        const created = (await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Plan", dueAt: inHours(48) })).body.data.task;

        // Pretend the reminder already fired.
        await prisma.task.update({ where: { id: created.id }, data: { remindAt: null } });
        const renamed = await team.owner.client.put(`/tasks/${created.id}`, { version: created.version, title: "Plan v2" });
        expect(renamed.body.data.task.remindAt).toBeNull();

        const moved = await team.owner.client.put(`/tasks/${created.id}`, { version: renamed.body.data.task.version, dueAt: inHours(96) });
        expect(moved.body.data.task.remindAt).not.toBeNull();
    });

    it("completing clears the schedule; reopening plans future times again", async () => {
        const team = await createTeam();
        const created = (await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Close me", dueAt: inHours(48) })).body.data.task;

        const completed = await team.owner.client.patch(`/tasks/${created.id}/status`, { status: "completed", completionNote: "Done", version: created.version });
        expect(completed.body.data.task).toMatchObject({ remindAt: null, overdueCheckAt: null });

        const reopened = await team.owner.client.patch(`/tasks/${created.id}/status`, { status: "todo", version: completed.body.data.task.version });
        expect(reopened.body.data.task.remindAt).not.toBeNull();
        expect(reopened.body.data.task.overdueCheckAt).not.toBeNull();
    });

    it("archiving a project pauses its reminders; restoring re-plans them", async () => {
        const team = await createTeam();
        const project = (await team.owner.client.post(`/workspaces/${team.workspace.id}/projects`, { name: "Launch" })).body.data.project;
        const task = (await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "In project", dueAt: inHours(48), projectId: project.id })).body.data.task;

        await team.owner.client.post(`/projects/${project.id}/archive`);
        await expect(prisma.task.findUniqueOrThrow({ where: { id: task.id } })).resolves.toMatchObject({ remindAt: null, overdueCheckAt: null });

        await team.owner.client.post(`/projects/${project.id}/restore`);
        const restored = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
        expect(restored.remindAt).not.toBeNull();
        expect(restored.overdueCheckAt).not.toBeNull();
    });
});
