// API: deleting a workspace (Owner only) — permanent when only the Owner's records are in it,
// soft (closed to everyone, work kept) once someone else has left a record.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createProject, createTask, createTeam } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

describe("permission and confirmation", () => {
    it("only the Owner can delete, and only by typing the exact name", async () => {
        const team = await createTeam();
        const path = `/workspaces/${team.workspace.id}`;

        await expect(team.admin.client.delete(path).send({ confirmName: "Team Space" })).resolves.toMatchObject({ status: 403 });
        await expect(team.admin.client.get(`${path}/deletion-preview`)).resolves.toMatchObject({ status: 403 });
        await expect(team.outsider.client.delete(path).send({ confirmName: "Team Space" })).resolves.toMatchObject({ status: 404 });
        await expect(team.owner.client.delete(path).send({ confirmName: "team space" })).resolves.toMatchObject({ status: 400 });
        await expect(team.owner.client.delete(path)).resolves.toMatchObject({ status: 400 });
        await expect(prisma.workspace.count()).resolves.toBe(1);
    });
});

describe("permanent delete", () => {
    it("removes a workspace holding only the Owner's own work, even with members who never did anything", async () => {
        const team = await createTeam();
        const project = await createProject(team.workspace.id, team.owner.user.id);
        const task = await createTask(team.workspace.id, team.owner.user.id, { projectId: project.id, assigneeMembershipId: team.member.membership.id });
        await team.owner.client.post(`/tasks/${task.id}/subtasks`, { title: "child" });
        await team.owner.client.post(`/tasks/${task.id}/comments`, { body: "note to self" });

        const preview = await team.owner.client.get(`/workspaces/${team.workspace.id}/deletion-preview`);
        expect(preview.body.data).toMatchObject({ mode: "permanent", otherContributors: 0, counts: { tasks: 2, projects: 1, members: 3 } });

        const deleted = await team.owner.client.delete(`/workspaces/${team.workspace.id}`).send({ confirmName: "Team Space" });
        expect(deleted.body.data.mode).toBe("permanent");
        await expect(prisma.workspace.count()).resolves.toBe(0);
        await expect(prisma.task.count()).resolves.toBe(0);
        await expect(prisma.membership.count()).resolves.toBe(0);
        // The accounts themselves are untouched.
        await expect(prisma.user.count()).resolves.toBe(4);
    });
});

describe("soft delete", () => {
    it("keeps everyone's work but closes the workspace to every member at once", async () => {
        const team = await createTeam();
        const memberTask = await createTask(team.workspace.id, team.member.user.id, { title: "Member's work" });
        await team.owner.client.post(`/workspaces/${team.workspace.id}/invitations`, { email: "pending@afritask.invalid" });

        const preview = await team.owner.client.get(`/workspaces/${team.workspace.id}/deletion-preview`);
        expect(preview.body.data).toMatchObject({ mode: "soft", otherContributors: 1 });

        const deleted = await team.owner.client.delete(`/workspaces/${team.workspace.id}`).send({ confirmName: "Team Space" });
        expect(deleted.body.data.mode).toBe("soft");

        // Kept…
        await expect(prisma.task.findUnique({ where: { id: memberTask.id } })).resolves.not.toBeNull();
        await expect(prisma.workspace.findUniqueOrThrow({ where: { id: team.workspace.id } })).resolves.toMatchObject({ deletedById: team.owner.user.id });
        // …but closed: gone from lists, and every route answers like a missing workspace.
        for (const person of [team.owner, team.admin, team.member]) {
            const list = await person.client.get("/workspaces");
            expect(list.body.data.workspaces).toEqual([]);
            await expect(person.client.get(`/workspaces/${team.workspace.id}`)).resolves.toMatchObject({ status: 404 });
            await expect(person.client.get(`/workspaces/${team.workspace.id}/tasks`)).resolves.toMatchObject({ status: 404 });
            await expect(person.client.get(`/tasks/${memberTask.id}`)).resolves.toMatchObject({ status: 404 });
        }
        // Pending invitations are withdrawn.
        await expect(prisma.invitation.findFirstOrThrow()).resolves.toMatchObject({ status: "revoked" });
    });

    it("joining alone isn't a record; working is", async () => {
        const team = await createTeam();
        // The Owner's own work only, plus "member.*" activity from people joining.
        await prisma.activity.create({
            data: { workspaceId: team.workspace.id, actorId: team.member.user.id, entityType: "membership", entityId: team.member.membership.id, action: "member.joined" },
        });
        const joinedOnly = await team.owner.client.get(`/workspaces/${team.workspace.id}/deletion-preview`);
        expect(joinedOnly.body.data.mode).toBe("permanent");

        const task = await createTask(team.workspace.id, team.owner.user.id);
        await team.admin.client.post(`/tasks/${task.id}/comments`, { body: "on it" });
        const commented = await team.owner.client.get(`/workspaces/${team.workspace.id}/deletion-preview`);
        expect(commented.body.data).toMatchObject({ mode: "soft", otherContributors: 1 });
    });

    it("stops reminders for the workspace", async () => {
        const team = await createTeam();
        await createTask(team.workspace.id, team.member.user.id);
        await prisma.task.updateMany({ data: { remindAt: new Date(Date.now() + 3_600_000), overdueCheckAt: new Date(Date.now() + 7_200_000) } });

        await team.owner.client.delete(`/workspaces/${team.workspace.id}`).send({ confirmName: "Team Space" });
        await expect(prisma.task.count({ where: { OR: [{ remindAt: { not: null } }, { overdueCheckAt: { not: null } }] } })).resolves.toBe(0);
    });
});
