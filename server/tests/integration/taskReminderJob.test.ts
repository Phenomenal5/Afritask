// Integration: the daily reminder job's selection and recipient rules (PRD FR10),
// run directly — the BullMQ worker just calls this function.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { sendDueTomorrowReminders } from "../../src/jobs/taskReminder.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { addMember, createProject, createTask, createUser, createWorkspace } from "../helpers/factories.js";
import { clearMailbox, emailsTo, testMailbox } from "../helpers/mailbox.js";

beforeEach(async () => {
    await resetDatabase();
    clearMailbox();
});
afterAll(disconnectDatabase);

// Noon UTC tomorrow — inside the job's "tomorrow" window regardless of the machine's zone.
const tomorrowNoon = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return new Date(`${tomorrow.toISOString().slice(0, 10)}T12:00:00.000Z`);
};

describe("sendDueTomorrowReminders", () => {
    it("emails the assignee about a task due tomorrow", async () => {
        const owner = await createUser();
        const assignee = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        const membership = await addMember(workspace.id, assignee.id);
        await createTask(workspace.id, owner.id, { title: "Ship it", dueAt: tomorrowNoon(), assigneeMembershipId: membership.id });

        await expect(sendDueTomorrowReminders()).resolves.toBe(1);
        expect(emailsTo(assignee.email)).toHaveLength(1);
        expect(emailsTo(assignee.email)[0]!.subject).toContain("Ship it");
        expect(emailsTo(owner.email)).toHaveLength(0);
    });

    it("falls back to the creator when the task is unassigned", async () => {
        const owner = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        await createTask(workspace.id, owner.id, { dueAt: tomorrowNoon() });

        await sendDueTomorrowReminders();
        expect(emailsTo(owner.email)).toHaveLength(1);
    });

    it("skips completed tasks, tasks in archived projects, and tasks not due tomorrow", async () => {
        const owner = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        const archived = await createProject(workspace.id, owner.id, { state: "archived" });
        await createTask(workspace.id, owner.id, { dueAt: tomorrowNoon(), status: "completed" });
        await createTask(workspace.id, owner.id, { dueAt: tomorrowNoon(), projectId: archived.id });
        await createTask(workspace.id, owner.id, { dueAt: new Date(Date.now() + 5 * 24 * 3600 * 1000) });
        await createTask(workspace.id, owner.id, { dueAt: null });

        await expect(sendDueTomorrowReminders()).resolves.toBe(0);
        expect(testMailbox.sent).toHaveLength(0);
    });

    it("never emails someone who has left the workspace", async () => {
        const owner = await createUser();
        const formerMember = await createUser();
        const { workspace } = await createWorkspace(owner.id);
        const membership = await addMember(workspace.id, formerMember.id);
        // Their own unassigned task, plus one still pointing at their (now removed) membership.
        await createTask(workspace.id, formerMember.id, { dueAt: tomorrowNoon() });
        await createTask(workspace.id, owner.id, { dueAt: tomorrowNoon(), assigneeMembershipId: membership.id });
        await prisma.membership.update({ where: { id: membership.id }, data: { status: "removed", removedAt: new Date() } });

        await sendDueTomorrowReminders();
        expect(emailsTo(formerMember.email)).toHaveLength(0);
    });
});
