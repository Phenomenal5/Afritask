// Integration: the per-task reminder sweep (SRS SR10) — run directly; the BullMQ worker
// just calls runReminderSweep(). Covers recipients, the re-check before delivery,
// exactly-once delivery, missed schedules, and the bounded email retry.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { MAX_EMAIL_ATTEMPTS, runReminderSweep } from "../../src/jobs/taskReminder.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { addMember, createProject, createTask, createUser, createWorkspace } from "../helpers/factories.js";
import { clearMailbox, emailsTo, testMailbox } from "../helpers/mailbox.js";

beforeEach(async () => {
    await resetDatabase();
    clearMailbox();
});
afterAll(disconnectDatabase);

const MINUTE = 60_000;

// A task whose reminder came due a minute ago.
const dueReminder = async (workspaceId: string, creatorId: string, overrides: Parameters<typeof createTask>[2] = {}) => {
    const task = await createTask(workspaceId, creatorId, { dueAt: new Date(Date.now() + 24 * 60 * MINUTE), ...overrides });
    return prisma.task.update({ where: { id: task.id }, data: { reminderOffset: "one_day", remindAt: new Date(Date.now() - MINUTE) } });
};

describe("reminders", () => {
    it("emails and notifies the assignee once, then clears the schedule", async () => {
        const owner = await createUser();
        const assignee = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        const membership = await addMember(workspace.id, assignee.id);
        const task = await dueReminder(workspace.id, owner.id, { title: "Ship it", assigneeMembershipId: membership.id });

        await expect(runReminderSweep()).resolves.toMatchObject({ reminders: 1 });
        expect(emailsTo(assignee.email).map((email) => email.subject)).toEqual(["Task Reminder: Ship it"]);
        expect(emailsTo(owner.email)).toHaveLength(0);
        await expect(prisma.notification.findMany({ where: { recipientId: assignee.id } })).resolves.toMatchObject([{ type: "task_reminder", taskId: task.id }]);
        await expect(prisma.task.findUniqueOrThrow({ where: { id: task.id } })).resolves.toMatchObject({ remindAt: null });

        // Running again (a retried job, a second instance) delivers nothing more.
        await expect(runReminderSweep()).resolves.toMatchObject({ reminders: 0 });
        expect(emailsTo(assignee.email)).toHaveLength(1);
    });

    it("falls back to the creator for unassigned work, while they're still a member", async () => {
        const owner = await createUser();
        const formerMember = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        await addMember(workspace.id, formerMember.id);
        await dueReminder(workspace.id, owner.id);
        await dueReminder(workspace.id, formerMember.id);
        await prisma.membership.updateMany({ where: { userId: formerMember.id }, data: { status: "removed", removedAt: new Date() } });

        await runReminderSweep();
        expect(emailsTo(owner.email)).toHaveLength(1);
        expect(emailsTo(formerMember.email)).toHaveLength(0);
    });

    it("re-checks before sending: completed work and archived projects are suppressed", async () => {
        const owner = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        const archived = await createProject(workspace.id, owner.id, { state: "archived" });
        await dueReminder(workspace.id, owner.id, { status: "completed" });
        await dueReminder(workspace.id, owner.id, { projectId: archived.id });

        await expect(runReminderSweep()).resolves.toMatchObject({ reminders: 0 });
        expect(testMailbox.sent).toHaveLength(0);
        // Claimed and dropped — not retried every minute.
        await expect(prisma.task.count({ where: { remindAt: { not: null } } })).resolves.toBe(0);
    });

    it("drops a schedule missed by hours instead of sending it late", async () => {
        const owner = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        const task = await dueReminder(workspace.id, owner.id);
        await prisma.task.update({ where: { id: task.id }, data: { remindAt: new Date(Date.now() - 3 * 60 * MINUTE) } });

        await expect(runReminderSweep()).resolves.toMatchObject({ reminders: 0 });
        expect(testMailbox.sent).toHaveLength(0);
    });

    it("leaves future reminders alone", async () => {
        const owner = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        const task = await dueReminder(workspace.id, owner.id);
        await prisma.task.update({ where: { id: task.id }, data: { remindAt: new Date(Date.now() + 10 * MINUTE) } });

        await runReminderSweep();
        expect(testMailbox.sent).toHaveLength(0);
    });
});

describe("overdue alerts", () => {
    it("alerts once when an open task passes its deadline", async () => {
        const owner = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        const dueAt = new Date(Date.now() - MINUTE);
        const task = await createTask(workspace.id, owner.id, { title: "Late one", dueAt });
        await prisma.task.update({ where: { id: task.id }, data: { overdueCheckAt: dueAt } });

        await expect(runReminderSweep()).resolves.toMatchObject({ overdueAlerts: 1 });
        expect(emailsTo(owner.email).map((email) => email.subject)).toEqual(["Overdue: Late one"]);
        await expect(prisma.notification.findMany({ where: { recipientId: owner.id } })).resolves.toMatchObject([{ type: "task_overdue" }]);
        await runReminderSweep();
        expect(emailsTo(owner.email)).toHaveLength(1);
    });
});

describe("email failures", () => {
    it("records the failure, keeps the in-app notification, and retries a bounded number of times", async () => {
        const owner = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        await dueReminder(workspace.id, owner.id);

        testMailbox.failNextSend = true;
        await runReminderSweep();
        const failed = await prisma.emailDelivery.findFirstOrThrow();
        expect(failed).toMatchObject({ status: "failed", attempts: 1 });
        expect(failed.lastError).toContain("Simulated");
        await expect(prisma.notification.count()).resolves.toBe(1);

        // Retried only after a pause; then it goes through exactly once.
        await expect(runReminderSweep()).resolves.toMatchObject({ retried: 0 });
        await expect(runReminderSweep(new Date(Date.now() + 6 * MINUTE))).resolves.toMatchObject({ retried: 1 });
        await expect(prisma.emailDelivery.findFirstOrThrow()).resolves.toMatchObject({ status: "sent", attempts: 2 });
        expect(emailsTo(owner.email)).toHaveLength(1);
    });

    it("stops retrying after the attempt limit", async () => {
        const owner = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        const task = await dueReminder(workspace.id, owner.id);
        await prisma.task.update({ where: { id: task.id }, data: { remindAt: null } });
        await prisma.emailDelivery.create({
            data: { deliveryKey: "exhausted", kind: "task_reminder", recipientId: owner.id, taskId: task.id, status: "failed", attempts: MAX_EMAIL_ATTEMPTS },
        });

        await expect(runReminderSweep(new Date(Date.now() + 60 * MINUTE))).resolves.toMatchObject({ retried: 0 });
        expect(testMailbox.sent).toHaveLength(0);
    });

    it("suppresses a retry once the task is completed", async () => {
        const owner = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        await dueReminder(workspace.id, owner.id);
        testMailbox.failNextSend = true;
        await runReminderSweep();
        await prisma.task.updateMany({ data: { status: "completed" } });

        await runReminderSweep(new Date(Date.now() + 6 * MINUTE));
        await expect(prisma.emailDelivery.findFirstOrThrow()).resolves.toMatchObject({ status: "suppressed" });
        expect(testMailbox.sent).toHaveLength(0);
    });
});
