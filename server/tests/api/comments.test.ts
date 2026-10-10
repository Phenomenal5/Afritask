// API: comments and mentions (SRS SR08).
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createProject, createTask, createTeam } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

describe("comments", () => {
    it("any member comments; the thread shows authors oldest first", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);

        const first = await team.member.client.post(`/tasks/${task.id}/comments`, { body: "  Blocked on the API key  " });
        expect(first.status).toBe(201);
        expect(first.body.data.comment).toMatchObject({ body: "Blocked on the API key", author: { name: "Musa Member" }, editedAt: null, canEdit: true, canDelete: true });
        await team.admin.client.post(`/tasks/${task.id}/comments`, { body: "Sending it now" });

        const thread = await team.owner.client.get(`/tasks/${task.id}/comments`);
        expect(thread.status).toBe(200);
        expect(thread.body.data.comments.map((comment: { body: string }) => comment.body)).toEqual(["Blocked on the API key", "Sending it now"]);
        // The Owner can moderate but not edit someone else's words.
        expect(thread.body.data.comments[0]).toMatchObject({ canEdit: false, canDelete: true });
    });

    it("validates the body and keeps outsiders out", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);

        await expect(team.member.client.post(`/tasks/${task.id}/comments`, { body: "   " })).resolves.toMatchObject({ status: 400 });
        await expect(team.member.client.post(`/tasks/${task.id}/comments`, { body: "x".repeat(5001) })).resolves.toMatchObject({ status: 400 });
        await expect(team.outsider.client.post(`/tasks/${task.id}/comments`, { body: "hi" })).resolves.toMatchObject({ status: 404 });
        await expect(team.outsider.client.get(`/tasks/${task.id}/comments`)).resolves.toMatchObject({ status: 404 });
    });

    it("archived projects are read-only for discussion", async () => {
        const team = await createTeam();
        const archived = await createProject(team.workspace.id, team.owner.user.id, { state: "archived" });
        const task = await createTask(team.workspace.id, team.owner.user.id, { projectId: archived.id });

        const response = await team.owner.client.post(`/tasks/${task.id}/comments`, { body: "Still here?" });
        expect(response.status).toBe(409);
        // Reading stays possible.
        await expect(team.member.client.get(`/tasks/${task.id}/comments`)).resolves.toMatchObject({ status: 200 });
    });

    it("only the author edits; a real change shows the edited marker", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);
        const created = await team.member.client.post(`/tasks/${task.id}/comments`, { body: "Draft" });
        const commentId = created.body.data.comment.id;

        const unchanged = await team.member.client.patch(`/comments/${commentId}`, { body: "Draft" });
        expect(unchanged.body.data.comment.editedAt).toBeNull();

        const edited = await team.member.client.patch(`/comments/${commentId}`, { body: "Final" });
        expect(edited.status).toBe(200);
        expect(edited.body.data.comment).toMatchObject({ body: "Final" });
        expect(edited.body.data.comment.editedAt).not.toBeNull();

        await expect(team.owner.client.patch(`/comments/${commentId}`, { body: "Owner rewrite" })).resolves.toMatchObject({ status: 403 });
        await expect(team.outsider.client.patch(`/comments/${commentId}`, { body: "x" })).resolves.toMatchObject({ status: 404 });
    });

    it("authors delete their own; Admins moderate with attribution; Members can't delete others'", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);
        const byAdmin = await team.admin.client.post(`/tasks/${task.id}/comments`, { body: "Admin note" });
        const byMember = await team.member.client.post(`/tasks/${task.id}/comments`, { body: "Off-topic" });

        await expect(team.member.client.delete(`/comments/${byAdmin.body.data.comment.id}`)).resolves.toMatchObject({ status: 403 });

        const moderated = await team.admin.client.delete(`/comments/${byMember.body.data.comment.id}`);
        expect(moderated.status).toBe(200);
        expect(moderated.body.data.comment).toMatchObject({ body: "", deletedBy: { name: "Ada Admin" }, canEdit: false, canDelete: false });

        // The thread keeps its shape without the text.
        const thread = await team.member.client.get(`/tasks/${task.id}/comments`);
        expect(thread.body.data.comments[1]).toMatchObject({ body: "", deletedBy: { name: "Ada Admin" } });
        const stored = await prisma.comment.findUniqueOrThrow({ where: { id: byMember.body.data.comment.id } });
        expect(stored.body).toBe("");

        await expect(team.admin.client.delete(`/comments/${byMember.body.data.comment.id}`)).resolves.toMatchObject({ status: 409 });
    });
});

describe("mentions", () => {
    it("stores each mentioned member once, by membership", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);

        const response = await team.owner.client.post(`/tasks/${task.id}/comments`, {
            body: "@Ada Admin and @Musa Member — @Ada Admin again",
            mentionMembershipIds: [team.admin.membership.id, team.member.membership.id, team.admin.membership.id],
        });
        expect(response.status).toBe(201);
        expect(response.body.data.comment.mentions.map((mention: { name: string }) => mention.name).sort()).toEqual(["Ada Admin", "Musa Member"]);
    });

    it("refuses mentions of non-members and former members", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);
        const otherTeam = await createTeam();
        await prisma.membership.update({ where: { id: team.member.membership.id }, data: { status: "removed" } });

        await expect(
            team.owner.client.post(`/tasks/${task.id}/comments`, { body: "hi", mentionMembershipIds: [otherTeam.member.membership.id] })
        ).resolves.toMatchObject({ status: 400 });
        await expect(
            team.owner.client.post(`/tasks/${task.id}/comments`, { body: "hi", mentionMembershipIds: [team.member.membership.id] })
        ).resolves.toMatchObject({ status: 400 });
    });

    it("editing replaces mentions when sent and keeps them when omitted", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);
        const created = await team.owner.client.post(`/tasks/${task.id}/comments`, { body: "@Ada", mentionMembershipIds: [team.admin.membership.id] });
        const commentId = created.body.data.comment.id;

        const kept = await team.owner.client.patch(`/comments/${commentId}`, { body: "@Ada please" });
        expect(kept.body.data.comment.mentions).toHaveLength(1);

        const replaced = await team.owner.client.patch(`/comments/${commentId}`, { body: "@Musa instead", mentionMembershipIds: [team.member.membership.id] });
        expect(replaced.body.data.comment.mentions).toMatchObject([{ name: "Musa Member" }]);
    });
});
