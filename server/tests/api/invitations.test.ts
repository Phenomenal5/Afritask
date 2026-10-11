// API: invitations — create, list, resend, revoke, preview, accept, decline.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { anonymous } from "../helpers/client.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createSignedInUser, createTeam, createUser, uniqueEmail } from "../helpers/factories.js";
import { INVITE_LINK, clearMailbox, lastEmailTo, testMailbox, tokenFromEmail } from "../helpers/mailbox.js";

beforeEach(async () => {
    await resetDatabase();
    clearMailbox();
});
afterAll(disconnectDatabase);

const invite = (client: { post: (path: string, body?: object) => Promise<{ status: number; body: any }> }, workspaceId: string, email: string, role?: string) =>
    client.post(`/workspaces/${workspaceId}/invitations`, { email, role });

describe("POST /workspaces/:id/invitations", () => {
    it("records the invitation, grants nothing yet, and emails a link", async () => {
        const team = await createTeam();
        const invitee = await createSignedInUser();
        const response = await invite(team.owner.client, team.workspace.id, invitee.user.email.toUpperCase(), "member");

        expect(response.status).toBe(201);
        expect(response.body.data.invitation).toMatchObject({ email: invitee.user.email, role: "member", status: "pending", deliveryStatus: "sent" });
        expect(lastEmailTo(invitee.user.email).text).toMatch(INVITE_LINK);
        await expect(invitee.client.get(`/workspaces/${team.workspace.id}`)).resolves.toMatchObject({ status: 404 });
        expect(JSON.stringify(response.body)).not.toMatch(/tokenHash/);
    });

    it.each([
        ["owner", "admin", 201],
        ["owner", "member", 201],
        ["admin", "member", 201],
        ["admin", "admin", 403],
        ["member", "member", 403],
        ["outsider", "member", 404],
    ] as const)("%s inviting a %s → %i", async (who, role, status) => {
        const team = await createTeam();
        const response = await invite(team[who].client, team.workspace.id, uniqueEmail("invitee"), role);
        expect(response.status).toBe(status);
    });

    it.each([
        [{ email: "nope" }, 400],
        [{ email: "x@afritask.invalid", role: "owner" }, 400],
    ])("rejects %p", async (body, status) => {
        const team = await createTeam();
        await expect(team.owner.client.post(`/workspaces/${team.workspace.id}/invitations`, body)).resolves.toMatchObject({ status });
    });

    it("rejects inviting an existing member, or someone already invited", async () => {
        const team = await createTeam();
        await expect(invite(team.owner.client, team.workspace.id, team.member.user.email)).resolves.toMatchObject({ status: 409 });
        const email = uniqueEmail();
        await invite(team.owner.client, team.workspace.id, email);
        await expect(invite(team.owner.client, team.workspace.id, email)).resolves.toMatchObject({ status: 409 });
    });

    it("keeps the invitation pending (deliveryStatus failed) when the email can't be sent", async () => {
        const team = await createTeam();
        testMailbox.failNextSend = true;
        const response = await invite(team.owner.client, team.workspace.id, uniqueEmail());
        expect(response.status).toBe(201);
        expect(response.body.data.invitation).toMatchObject({ status: "pending", deliveryStatus: "failed" });
    });
});

describe("listing, resending and revoking", () => {
    it("managers see pending invitations; members don't", async () => {
        const team = await createTeam();
        await invite(team.owner.client, team.workspace.id, uniqueEmail());
        await expect(team.admin.client.get(`/workspaces/${team.workspace.id}/invitations`)).resolves.toMatchObject({ status: 200, body: { results: 1 } });
        await expect(team.member.client.get(`/workspaces/${team.workspace.id}/invitations`)).resolves.toMatchObject({ status: 403 });
    });

    it("resend issues a new link and kills the old one", async () => {
        const team = await createTeam();
        const email = uniqueEmail();
        const created = await invite(team.owner.client, team.workspace.id, email);
        const oldToken = tokenFromEmail(email, INVITE_LINK);

        const resent = await team.owner.client.post(`/invitations/${created.body.data.invitation.id}/resend`);
        expect(resent.status).toBe(200);
        const newToken = tokenFromEmail(email, INVITE_LINK);
        expect(newToken).not.toBe(oldToken);
        await expect(anonymous().get(`/api/v1/invitations/preview/${oldToken}`)).resolves.toMatchObject({ status: 404 });
        await expect(anonymous().get(`/api/v1/invitations/preview/${newToken}`)).resolves.toMatchObject({ status: 200 });
    });

    it("Admins manage Member invitations but not Admin ones; Members manage none", async () => {
        const team = await createTeam();
        const memberInvite = await invite(team.owner.client, team.workspace.id, uniqueEmail(), "member");
        const adminInvite = await invite(team.owner.client, team.workspace.id, uniqueEmail(), "admin");

        await expect(team.admin.client.post(`/invitations/${adminInvite.body.data.invitation.id}/revoke`)).resolves.toMatchObject({ status: 403 });
        await expect(team.member.client.post(`/invitations/${memberInvite.body.data.invitation.id}/revoke`)).resolves.toMatchObject({ status: 404 });
        await expect(team.outsider.client.post(`/invitations/${memberInvite.body.data.invitation.id}/revoke`)).resolves.toMatchObject({ status: 404 });
        await expect(team.admin.client.post(`/invitations/${memberInvite.body.data.invitation.id}/revoke`)).resolves.toMatchObject({ status: 200 });
        await expect(team.admin.client.post(`/invitations/${memberInvite.body.data.invitation.id}/revoke`)).resolves.toMatchObject({ status: 409 });
    });
});

describe("recipient side", () => {
    const setup = async () => {
        const team = await createTeam();
        const invitee = await createSignedInUser({ name: "Ivy Invitee" });
        const created = await invite(team.owner.client, team.workspace.id, invitee.user.email, "member");
        return { team, invitee, invitationId: created.body.data.invitation.id as string, token: tokenFromEmail(invitee.user.email, INVITE_LINK) };
    };

    it("public preview shows what the invitation is for", async () => {
        const { token, invitee } = await setup();
        const response = await anonymous().get(`/api/v1/invitations/preview/${token}`);
        expect(response.status).toBe(200);
        expect(response.body.data.invitation).toMatchObject({ workspaceName: "Team Space", inviterName: "Olu Owner", role: "member", status: "pending", email: invitee.user.email });
    });

    it("/invitations/mine lists invitations addressed to me (case-insensitive)", async () => {
        const { invitee } = await setup();
        await expect(invitee.client.get("/invitations/mine")).resolves.toMatchObject({ status: 200, body: { results: 1 } });
    });

    it("accepting (by token) creates the membership and consumes the invitation", async () => {
        const { team, invitee, token } = await setup();
        const response = await invitee.client.post("/invitations/accept", { token });
        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ workspaceId: team.workspace.id, role: "member" });
        await expect(invitee.client.get(`/workspaces/${team.workspace.id}`)).resolves.toMatchObject({ status: 200 });
        await expect(invitee.client.post("/invitations/accept", { token })).resolves.toMatchObject({ status: 409 });
    });

    it("accepting (by id from the in-app list) works too", async () => {
        const { invitee, invitationId } = await setup();
        await expect(invitee.client.post("/invitations/accept", { invitationId })).resolves.toMatchObject({ status: 200 });
    });

    it("concurrent accepts create exactly one membership (SRS AC02)", async () => {
        const { team, invitee, token } = await setup();
        const responses = await Promise.all(Array.from({ length: 5 }, () => invitee.client.post("/invitations/accept", { token })));
        expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
        expect(await prisma.membership.count({ where: { workspaceId: team.workspace.id, userId: invitee.user.id } })).toBe(1);
    });

    it("only the invited email can respond", async () => {
        const { token, team } = await setup();
        const response = await team.outsider.client.post("/invitations/accept", { token });
        expect(response.status).toBe(403);
        expect(response.body.message).toContain("This invitation is for");
    });

    it("declining, revoking and expiry all prevent acceptance", async () => {
        const { invitee, invitationId, team } = await setup();
        await expect(invitee.client.post("/invitations/decline", { invitationId })).resolves.toMatchObject({ status: 200 });
        await expect(invitee.client.post("/invitations/accept", { invitationId })).resolves.toMatchObject({ status: 409 });

        const secondEmail = uniqueEmail();
        const secondUser = await createUser({ email: secondEmail });
        const second = await invite(team.owner.client, team.workspace.id, secondEmail);
        await prisma.invitation.update({ where: { id: second.body.data.invitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
        const { signIn } = await import("../helpers/factories.js");
        const secondClient = await signIn(secondUser.email);
        await expect(secondClient.post("/invitations/accept", { invitationId: second.body.data.invitation.id })).resolves.toMatchObject({ status: 410 });
        await expect(secondClient.get("/invitations/mine")).resolves.toMatchObject({ body: { results: 0 } });
    });

    it("a former member re-joining reactivates their old membership row", async () => {
        const { team, invitee, token } = await setup();
        await invitee.client.post("/invitations/accept", { token });
        await invitee.client.post(`/workspaces/${team.workspace.id}/leave`);
        await invite(team.owner.client, team.workspace.id, invitee.user.email, "admin");
        const rejoin = await invitee.client.post("/invitations/accept", { token: tokenFromEmail(invitee.user.email, INVITE_LINK) });

        expect(rejoin.body.data.role).toBe("admin");
        const rows = await prisma.membership.findMany({ where: { workspaceId: team.workspace.id, userId: invitee.user.id } });
        expect(rows).toEqual([expect.objectContaining({ status: "active", role: "admin", removedAt: null })]);
    });

    it("requires a token or an id", async () => {
        const { invitee } = await setup();
        await expect(invitee.client.post("/invitations/accept", {})).resolves.toMatchObject({ status: 400 });
    });
});
