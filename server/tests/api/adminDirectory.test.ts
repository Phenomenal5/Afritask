// API: the admin directory and suspend/restore (SRS SR17).
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { DEFAULT_PASSWORD, createSignedInUser, createTask, createTeam, createUser } from "../helpers/factories.js";
import { createClient } from "../helpers/client.js";
import { createOperatorClient } from "../helpers/operator.js";
import { runReminderSweep } from "../../src/jobs/taskReminder.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

const REASON = { reason: "Reported for spam" };

describe("who can use the directory", () => {
    it("customers and outsiders are refused; a fully signed-in operator is allowed", async () => {
        const { client: customer } = await createSignedInUser();
        await expect(customer.get("/admin/accounts")).resolves.toMatchObject({ status: 401 });
        await expect(createClient().get("/admin/workspaces")).resolves.toMatchObject({ status: 401 });

        const { client: operator } = await createOperatorClient();
        await expect(operator.get("/accounts")).resolves.toMatchObject({ status: 200 });
    });

    it("an operator whose MFA isn't verified yet can't use it", async () => {
        const { user, client } = await createOperatorClient();
        await prisma.session.updateMany({ where: { userId: user.id }, data: { mfaVerifiedAt: null } });
        await expect(client.get("/accounts")).resolves.toMatchObject({ status: 401 });
    });
});

describe("search", () => {
    it("finds accounts by name, email or id, and pages through them", async () => {
        const { client } = await createOperatorClient();
        const ada = await createUser({ name: "Ada Lovelace", email: "ada@afritask.invalid" });
        await createUser({ name: "Musa Bello" });

        const byName = await client.get("/accounts?q=lovelace");
        expect(byName.body.data.items).toMatchObject([{ id: ada.id, name: "Ada Lovelace", status: "active", isVerified: true }]);
        const byEmail = await client.get("/accounts?q=ADA@afritask");
        expect(byEmail.body.data.items.map((account: { id: string }) => account.id)).toEqual([ada.id]);
        const byId = await client.get(`/accounts?q=${ada.id}`);
        expect(byId.body.data.items).toHaveLength(1);

        const paged = await client.get("/accounts?limit=1&page=2");
        expect(paged.body.data.pagination).toMatchObject({ page: 2, limit: 1, total: 3, totalPages: 3 });
    });

    it("shows a workspace's owner and size — but never its content", async () => {
        const { client } = await createOperatorClient();
        const team = await createTeam();
        await createTask(team.workspace.id, team.owner.user.id, { title: "Confidential plan" });

        const list = await client.get("/workspaces?q=team");
        expect(list.body.data.items).toMatchObject([{ id: team.workspace.id, status: "active", memberCount: 3, owner: { id: team.owner.user.id } }]);

        const detail = await client.get(`/workspaces/${team.workspace.id}`);
        expect(detail.body.data.workspace.counts).toEqual({ projects: 0, tasks: 1 });
        expect(JSON.stringify(detail.body)).not.toContain("Confidential plan");
    });
});

describe("account suspension", () => {
    it("signs them out everywhere, blocks sign-in, keeps their memberships, and is audited", async () => {
        const { user: operator, client } = await createOperatorClient();
        const team = await createTeam();
        const memberClient = team.member.client;

        await expect(client.post(`/accounts/${team.member.user.id}/suspend`, { reason: "no" })).resolves.toMatchObject({ status: 400 });
        const suspended = await client.post(`/accounts/${team.member.user.id}/suspend`, REASON);
        expect(suspended.body.data.account).toMatchObject({ status: "suspended", suspendReason: "Reported for spam", workspaceCount: 1 });

        // Signed out at once, and can't sign back in.
        await expect(memberClient.get("/auth/me")).resolves.toMatchObject({ status: 401 });
        const login = await createClient().post("/auth/login", { email: team.member.user.email, password: DEFAULT_PASSWORD });
        expect(login.status).toBe(403);
        expect(login.body.message).toMatch(/suspended/);
        // Membership untouched.
        await expect(prisma.membership.findUniqueOrThrow({ where: { id: team.member.membership.id } })).resolves.toMatchObject({ status: "active" });

        await expect(prisma.adminAuditEntry.findFirst({ where: { action: "account.suspended" } })).resolves.toMatchObject({
            actorId: operator.id,
            targetId: team.member.user.id,
            reason: "Reported for spam",
        });

        await expect(client.post(`/accounts/${team.member.user.id}/suspend`, REASON)).resolves.toMatchObject({ status: 409 });
        const restored = await client.post(`/accounts/${team.member.user.id}/restore`, { reason: "Appeal accepted" });
        expect(restored.body.data.account.status).toBe("active");
        await expect(createClient().post("/auth/login", { email: team.member.user.email, password: DEFAULT_PASSWORD })).resolves.toMatchObject({ status: 200 });
    });

    it("an operator can't suspend themselves", async () => {
        const { user, client } = await createOperatorClient();
        await expect(client.post(`/accounts/${user.id}/suspend`, REASON)).resolves.toMatchObject({ status: 409 });
    });

    it("a suspended account gets no notifications or reminder emails", async () => {
        const { client } = await createOperatorClient();
        const team = await createTeam();
        await client.post(`/accounts/${team.member.user.id}/suspend`, REASON);

        await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "For a suspended member", assigneeMembershipId: team.member.membership.id });
        await expect(prisma.notification.count({ where: { recipientId: team.member.user.id } })).resolves.toBe(0);

        const task = await prisma.task.findFirstOrThrow();
        await prisma.task.update({ where: { id: task.id }, data: { dueAt: new Date(Date.now() + 86_400_000), reminderOffset: "one_day", remindAt: new Date(Date.now() - 60_000) } });
        await expect(runReminderSweep()).resolves.toMatchObject({ reminders: 0 });
    });
});

describe("workspace suspension", () => {
    it("members are told it's suspended, can't join, and reminders pause until restored", async () => {
        const { client } = await createOperatorClient();
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id, { dueAt: new Date(Date.now() + 3 * 86_400_000) });
        const invited = await team.owner.client.post(`/workspaces/${team.workspace.id}/invitations`, { email: team.outsider.user.email });

        await client.post(`/workspaces/${team.workspace.id}/suspend`, REASON);

        const blocked = await team.member.client.get(`/workspaces/${team.workspace.id}/tasks`);
        expect(blocked.status).toBe(403);
        expect(blocked.body.message).toMatch(/suspended/);
        await expect(team.member.client.get(`/tasks/${task.id}`)).resolves.toMatchObject({ status: 403 });
        await expect(team.outsider.client.post("/invitations/accept", { invitationId: invited.body.data.invitation.id })).resolves.toMatchObject({ status: 409 });
        // Members' accounts are fine — other workspaces and sign-in still work.
        await expect(team.member.client.get("/auth/me")).resolves.toMatchObject({ status: 200 });

        // Reminders due during the suspension are dropped, not saved up.
        await prisma.task.update({ where: { id: task.id }, data: { reminderOffset: "one_day", remindAt: new Date(Date.now() - 60_000) } });
        await expect(runReminderSweep()).resolves.toMatchObject({ reminders: 0 });

        const restored = await client.post(`/workspaces/${team.workspace.id}/restore`, { reason: "Issue resolved" });
        expect(restored.body.data.workspace.status).toBe("active");
        await expect(team.member.client.get(`/workspaces/${team.workspace.id}/tasks`)).resolves.toMatchObject({ status: 200 });
        // Future reminders are re-planned; nothing in the past.
        const replanned = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
        expect(replanned.remindAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it("a workspace deleted by its Owner can't be suspended", async () => {
        const { client } = await createOperatorClient();
        const team = await createTeam();
        await prisma.workspace.update({ where: { id: team.workspace.id }, data: { deletedAt: new Date() } });
        const list = await client.get("/workspaces?status=deleted");
        expect(list.body.data.items).toMatchObject([{ id: team.workspace.id, status: "deleted" }]);
        await expect(client.post(`/workspaces/${team.workspace.id}/suspend`, REASON)).resolves.toMatchObject({ status: 409 });
    });
});
