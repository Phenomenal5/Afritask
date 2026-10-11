// API: planning when a task starts ("I'll start it tomorrow"), with a reminder the day before.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createTeam } from "../helpers/factories.js";
import { clearMailbox, emailsTo } from "../helpers/mailbox.js";
import { runReminderSweep } from "../../src/jobs/taskReminder.js";

beforeEach(async () => {
    await resetDatabase();
    clearMailbox();
});
afterAll(disconnectDatabase);

const DAY = 24 * 60 * 60 * 1000;
// "YYYY-MM-DD" n days from now in UTC (test users' timezone).
const dateInDays = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

describe("start dates", () => {
    it("a date-only start means the start of that day, and schedules a reminder the day before", async () => {
        const team = await createTeam();
        const created = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Quarterly report", startDate: dateInDays(3) });

        expect(created.status).toBe(201);
        const task = created.body.data.task;
        expect(task).toMatchObject({ startKind: "date", startTimezone: "UTC", startAt: `${dateInDays(3)}T00:00:00.000Z` });
        // 09:00 the day before the start.
        expect(task.startReminderAt).toBe(`${dateInDays(2)}T09:00:00.000Z`);
    });

    it("can't start after it's due, whether set together or one at a time", async () => {
        const team = await createTeam();
        const tooLate = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Backwards", startDate: dateInDays(5), dueDate: dateInDays(4) });
        expect(tooLate.status).toBe(400);
        expect(tooLate.body.message).toMatch(/start date can't be after the due date/);

        const task = (await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Ok", dueDate: dateInDays(4) })).body.data.task;
        const moved = await team.owner.client.put(`/tasks/${task.id}`, { version: task.version, startDate: dateInDays(6) });
        expect(moved.status).toBe(400);

        // Same day is fine: a date-only start is 00:00, a date-only deadline 23:59.
        const sameDay = await team.owner.client.put(`/tasks/${task.id}`, { version: task.version, startDate: dateInDays(4) });
        expect(sameDay.status).toBe(200);
    });

    it("shows in the Scheduled view until it starts; changes are in the history", async () => {
        const team = await createTeam();
        const task = (await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, {
            title: "Plan the offsite",
            startDate: dateInDays(2),
            assigneeMembershipId: team.member.membership.id,
        })).body.data.task;

        const scheduled = await team.member.client.get(`/workspaces/${team.workspace.id}/tasks?assignee=me&due=scheduled`);
        expect(scheduled.body.data.tasks.map((listed: { title: string }) => listed.title)).toEqual(["Plan the offsite"]);

        const cleared = await team.owner.client.put(`/tasks/${task.id}`, { version: task.version, startDate: null });
        expect(cleared.body.data.task).toMatchObject({ startAt: null, startReminderAt: null });
        const history = await team.owner.client.get(`/tasks/${task.id}/activity`);
        expect(Object.keys(history.body.data.entries[0].changes)).toContain("startAt");
    });

    it("starting early cancels the 'starts tomorrow' reminder", async () => {
        const team = await createTeam();
        const task = (await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Early bird", startDate: dateInDays(3) })).body.data.task;
        const started = await team.owner.client.patch(`/tasks/${task.id}/status`, { status: "in_progress", version: task.version });
        expect(started.body.data.task.startReminderAt).toBeNull();
    });
});

describe("the 'starts tomorrow' reminder", () => {
    it("emails and notifies the assignee once when it comes due", async () => {
        const team = await createTeam();
        const task = (await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, {
            title: "Board prep",
            startDate: dateInDays(3),
            assigneeMembershipId: team.member.membership.id,
        })).body.data.task;
        await prisma.task.update({ where: { id: task.id }, data: { startReminderAt: new Date(Date.now() - 60_000) } });

        await expect(runReminderSweep()).resolves.toMatchObject({ startReminders: 1 });
        expect(emailsTo(team.member.user.email).map((email) => email.subject)).toEqual(["Starting tomorrow: Board prep"]);
        await expect(prisma.notification.findMany({ where: { recipientId: team.member.user.id, type: "task_starting" } })).resolves.toHaveLength(1);

        await expect(runReminderSweep()).resolves.toMatchObject({ startReminders: 0 });
        expect(emailsTo(team.member.user.email)).toHaveLength(1);
    });

    it("is suppressed if the work already started by the time it fires", async () => {
        const team = await createTeam();
        const task = (await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Already going", startDate: dateInDays(3) })).body.data.task;
        await prisma.task.update({ where: { id: task.id }, data: { status: "in_progress", startReminderAt: new Date(Date.now() - 60_000) } });

        await expect(runReminderSweep()).resolves.toMatchObject({ startReminders: 0 });
        expect(emailsTo(team.owner.user.email)).toHaveLength(0);
    });
});
