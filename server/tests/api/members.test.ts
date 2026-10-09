// API: members — role changes, removal, leaving, ownership transfer.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createTask, createTeam } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

const activeOwners = (workspaceId: string) => prisma.membership.count({ where: { workspaceId, role: "owner", status: "active" } });

describe("PATCH /workspaces/:id/members/:membershipId (role)", () => {
    it("the Owner switches admin ⇄ member", async () => {
        const team = await createTeam();
        const promote = await team.owner.client.patch(`/workspaces/${team.workspace.id}/members/${team.member.membership.id}`, { role: "admin" });
        expect(promote.status).toBe(200);
        expect(promote.body.data.member.role).toBe("admin");
    });

    it.each([
        ["admin", "member-target", { role: "admin" }, 403],
        ["owner", "owner-target", { role: "member" }, 409],
        ["owner", "member-target", { role: "owner" }, 400],
        ["owner", "member-target", { role: "superuser" }, 400],
    ] as const)("%s changing %s with %p → %i", async (who, target, body, status) => {
        const team = await createTeam();
        const targetId = target === "owner-target" ? team.owner.membership.id : team.member.membership.id;
        const response = await team[who].client.patch(`/workspaces/${team.workspace.id}/members/${targetId}`, body);
        expect(response.status).toBe(status);
    });

    it("a membership id from another workspace is 404", async () => {
        const team = await createTeam();
        const other = await createTeam();
        const response = await team.owner.client.patch(`/workspaces/${team.workspace.id}/members/${other.member.membership.id}`, { role: "admin" });
        expect(response.status).toBe(404);
    });
});

describe("DELETE /workspaces/:id/members/:membershipId (remove)", () => {
    it("removes access immediately and unassigns their OPEN tasks only", async () => {
        const team = await createTeam();
        const openTask = await createTask(team.workspace.id, team.owner.user.id, { assigneeMembershipId: team.member.membership.id });
        const doneTask = await createTask(team.workspace.id, team.owner.user.id, { assigneeMembershipId: team.member.membership.id, status: "completed" });

        const response = await team.admin.client.delete(`/workspaces/${team.workspace.id}/members/${team.member.membership.id}`);
        expect(response.status).toBe(200);
        await expect(team.member.client.get(`/workspaces/${team.workspace.id}`)).resolves.toMatchObject({ status: 404 });
        await expect(team.member.client.get(`/tasks/${openTask.id}`)).resolves.toMatchObject({ status: 404 });

        const [open, done] = await Promise.all([prisma.task.findUniqueOrThrow({ where: { id: openTask.id } }), prisma.task.findUniqueOrThrow({ where: { id: doneTask.id } })]);
        expect(open.assigneeMembershipId).toBeNull();
        expect(open.version).toBe(2);
        expect(done.assigneeMembershipId).toBe(team.member.membership.id);
        // The row is kept for history.
        await expect(prisma.membership.findUniqueOrThrow({ where: { id: team.member.membership.id } })).resolves.toMatchObject({ status: "removed" });
    });

    it.each([
        ["admin", "owner", 403],
        ["admin", "admin", 400], // removing yourself → use leave
        ["member", "admin", 403],
        ["owner", "owner", 400],
    ] as const)("%s removing the %s → %i", async (who, target, status) => {
        const team = await createTeam();
        const response = await team[who].client.delete(`/workspaces/${team.workspace.id}/members/${team[target].membership.id}`);
        expect(response.status).toBe(status);
    });

    it("an Admin can't remove another Admin", async () => {
        const team = await createTeam();
        await prisma.membership.update({ where: { id: team.member.membership.id }, data: { role: "admin" } });
        const response = await team.admin.client.delete(`/workspaces/${team.workspace.id}/members/${team.member.membership.id}`);
        expect(response.status).toBe(403);
    });
});

describe("POST /workspaces/:id/leave", () => {
    it("Admins and Members can leave; their access ends", async () => {
        const team = await createTeam();
        await expect(team.member.client.post(`/workspaces/${team.workspace.id}/leave`)).resolves.toMatchObject({ status: 200 });
        await expect(team.member.client.get("/workspaces")).resolves.toMatchObject({ body: { results: 0 } });
    });

    it("the Owner must transfer first", async () => {
        const team = await createTeam();
        const response = await team.owner.client.post(`/workspaces/${team.workspace.id}/leave`);
        expect(response.status).toBe(409);
        expect(await activeOwners(team.workspace.id)).toBe(1);
    });
});

describe("POST /workspaces/:id/transfer-ownership", () => {
    it("makes the target Owner and the old Owner an Admin", async () => {
        const team = await createTeam();
        const response = await team.owner.client.post(`/workspaces/${team.workspace.id}/transfer-ownership`, { membershipId: team.member.membership.id });
        expect(response.status).toBe(200);
        const roles = await prisma.membership.findMany({ where: { workspaceId: team.workspace.id }, select: { id: true, role: true } });
        expect(roles).toEqual(expect.arrayContaining([
            { id: team.owner.membership.id, role: "admin" },
            { id: team.member.membership.id, role: "owner" },
        ]));
    });

    it("concurrent transfers still leave exactly one Owner (SRS AC08)", async () => {
        const team = await createTeam();
        const responses = await Promise.all([
            team.owner.client.post(`/workspaces/${team.workspace.id}/transfer-ownership`, { membershipId: team.member.membership.id }),
            team.owner.client.post(`/workspaces/${team.workspace.id}/transfer-ownership`, { membershipId: team.admin.membership.id }),
        ]);
        expect(responses.filter((response) => response.status === 200)).toHaveLength(1);
        expect(await activeOwners(team.workspace.id)).toBe(1);
    });

    it.each([
        ["admin", 403],
        ["member", 403],
        ["outsider", 404],
    ] as const)("%s can't transfer → %i", async (who, status) => {
        const team = await createTeam();
        const response = await team[who].client.post(`/workspaces/${team.workspace.id}/transfer-ownership`, { membershipId: team.member.membership.id });
        expect(response.status).toBe(status);
    });

    it("can't transfer to a removed member or to yourself", async () => {
        const team = await createTeam();
        await prisma.membership.update({ where: { id: team.member.membership.id }, data: { status: "removed" } });
        await expect(team.owner.client.post(`/workspaces/${team.workspace.id}/transfer-ownership`, { membershipId: team.member.membership.id })).resolves.toMatchObject({ status: 404 });
        await expect(team.owner.client.post(`/workspaces/${team.workspace.id}/transfer-ownership`, { membershipId: team.owner.membership.id })).resolves.toMatchObject({ status: 400 });
    });
});
