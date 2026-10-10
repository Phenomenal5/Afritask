// API: in-app notifications (SRS SR08/SR10) — who hears about what, once, and only while
// they can still see it.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createTask, createTeam } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

type NotificationItem = { type: string; summary: string; available: boolean; taskId: string | null; readAt: string | null; id: string; actor: { name: string } | null };

const notificationsOf = async (client: { get: (path: string) => Promise<{ body: { data: { notifications: NotificationItem[]; unreadCount: number } } }> }) =>
    (await client.get("/notifications")).body.data;

describe("assignment notifications", () => {
    it("the new assignee hears about it; the actor never does", async () => {
        const team = await createTeam();
        await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Ship invoices", assigneeMembershipId: team.member.membership.id });
        // Assigning yourself is your own action — no notification.
        await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Mine", assigneeMembershipId: team.owner.membership.id });

        const member = await notificationsOf(team.member.client);
        expect(member.unreadCount).toBe(1);
        expect(member.notifications).toMatchObject([{ type: "task_assigned", summary: "Ship invoices", available: true, actor: { name: "Olu Owner" } }]);
        expect((await notificationsOf(team.owner.client)).notifications).toEqual([]);
    });

    it("reassigning notifies the new person; a save that keeps the assignee doesn't re-notify", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id, { assigneeMembershipId: team.member.membership.id });

        await team.owner.client.put(`/tasks/${task.id}`, { version: 1, title: "Renamed" });
        expect((await notificationsOf(team.member.client)).notifications).toHaveLength(0);

        await team.owner.client.put(`/tasks/${task.id}`, { version: 2, assigneeMembershipId: team.admin.membership.id });
        expect((await notificationsOf(team.admin.client)).notifications).toMatchObject([{ type: "task_assigned", summary: "Renamed" }]);
    });

    it("a stale (409) edit notifies nobody", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);
        await team.owner.client.put(`/tasks/${task.id}`, { version: 1, title: "First" });

        const stale = await team.owner.client.put(`/tasks/${task.id}`, { version: 1, assigneeMembershipId: team.member.membership.id });
        expect(stale.status).toBe(409);
        expect((await notificationsOf(team.member.client)).notifications).toHaveLength(0);
    });
});

describe("mention notifications", () => {
    it("one notification per person per comment, however often they're named; no self-mentions", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id, { title: "Budget" });
        await team.owner.client.post(`/tasks/${task.id}/comments`, {
            body: "@Musa @Musa and me @Olu",
            mentionMembershipIds: [team.member.membership.id, team.member.membership.id, team.owner.membership.id],
        });

        expect((await notificationsOf(team.member.client)).notifications).toMatchObject([{ type: "comment_mention", summary: "Budget" }]);
        expect((await notificationsOf(team.owner.client)).notifications).toHaveLength(0);
    });

    it("editing with unchanged mentions notifies nobody; adding someone notifies only them", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);
        const created = await team.owner.client.post(`/tasks/${task.id}/comments`, { body: "@Musa", mentionMembershipIds: [team.member.membership.id] });
        const commentId = created.body.data.comment.id;

        await team.owner.client.patch(`/comments/${commentId}`, { body: "@Musa please", mentionMembershipIds: [team.member.membership.id] });
        expect((await notificationsOf(team.member.client)).notifications).toHaveLength(1);

        await team.owner.client.patch(`/comments/${commentId}`, {
            body: "@Musa and @Ada",
            mentionMembershipIds: [team.member.membership.id, team.admin.membership.id],
        });
        expect((await notificationsOf(team.member.client)).notifications).toHaveLength(1);
        expect((await notificationsOf(team.admin.client)).notifications).toMatchObject([{ type: "comment_mention" }]);
    });
});

describe("invitation notifications", () => {
    it("an existing account is told in-app once; resending doesn't add another", async () => {
        const team = await createTeam();
        const invited = await team.owner.client.post(`/workspaces/${team.workspace.id}/invitations`, { email: team.outsider.user.email.toUpperCase(), role: "member" });
        expect(invited.status).toBe(201);
        await team.owner.client.post(`/invitations/${invited.body.data.invitation.id}/resend`);

        const outsider = await notificationsOf(team.outsider.client);
        expect(outsider.notifications).toMatchObject([{ type: "invitation_received", summary: "Team Space", available: true }]);

        // Once declined, the notification stays but can't be acted on.
        await team.outsider.client.post("/invitations/decline", { invitationId: invited.body.data.invitation.id });
        expect((await notificationsOf(team.outsider.client)).notifications).toMatchObject([{ available: false }]);
    });
});

describe("access re-check", () => {
    it("withholds the task title once the task is deleted or the recipient leaves", async () => {
        const team = await createTeam();
        await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Secret plan", assigneeMembershipId: team.member.membership.id });
        await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Admin work", assigneeMembershipId: team.admin.membership.id });

        const memberTask = await prisma.task.findFirstOrThrow({ where: { title: "Secret plan" } });
        await team.owner.client.delete(`/tasks/${memberTask.id}`);
        expect((await notificationsOf(team.member.client)).notifications).toMatchObject([
            { available: false, summary: "", taskId: null },
        ]);

        await team.admin.client.post(`/workspaces/${team.workspace.id}/leave`);
        expect((await notificationsOf(team.admin.client)).notifications).toMatchObject([{ available: false, summary: "" }]);
    });
});

describe("read state", () => {
    it("marks one or all as read; other people's notifications look missing", async () => {
        const team = await createTeam();
        for (const title of ["one", "two"]) {
            await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title, assigneeMembershipId: team.member.membership.id });
        }
        const { notifications } = await notificationsOf(team.member.client);

        await expect(team.admin.client.post(`/notifications/${notifications[0].id}/read`)).resolves.toMatchObject({ status: 404 });

        const markedOne = await team.member.client.post(`/notifications/${notifications[0].id}/read`);
        expect(markedOne.body.data.unreadCount).toBe(1);
        const unreadOnly = await team.member.client.get("/notifications?unread=true");
        expect(unreadOnly.body.data.notifications).toHaveLength(1);

        await team.member.client.post("/notifications/read-all");
        const count = await team.member.client.get("/notifications/unread-count");
        expect(count.body.data.unreadCount).toBe(0);
    });
});
