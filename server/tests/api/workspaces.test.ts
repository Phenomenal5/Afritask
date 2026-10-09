// API: /api/workspaces — create, list, details, rename, isolation.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createSignedInUser, createTeam } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

describe("POST /workspaces + GET /workspaces", () => {
    it("a new account has no workspaces; creating one makes you its Owner", async () => {
        const { client, user } = await createSignedInUser();
        await expect(client.get("/workspaces")).resolves.toMatchObject({ status: 200, body: { results: 0 } });

        const created = await client.post("/workspaces", { name: "  Client Websites " });
        expect(created.status).toBe(201);
        expect(created.body.data.workspace).toMatchObject({ name: "Client Websites", role: "owner", memberCount: 1 });

        const memberships = await prisma.membership.findMany({ where: { userId: user.id } });
        expect(memberships).toEqual([expect.objectContaining({ role: "owner", status: "active" })]);

        const list = await client.get("/workspaces");
        expect(list.body.data.workspaces).toEqual([
            expect.objectContaining({ id: created.body.data.workspace.id, role: "owner", memberCount: 1 }),
        ]);
    });

    it.each([
        [{}, "Workspace name is required"],
        [{ name: "   " }, "Workspace name is required"],
        [{ name: "x".repeat(101) }, "Workspace name must be 100 characters or fewer"],
    ])("rejects %p", async (body, message) => {
        const { client } = await createSignedInUser();
        const response = await client.post("/workspaces", body);
        expect(response.status).toBe(400);
        expect(response.body.message).toBe(message);
    });

    it("lists each workspace with MY role in it", async () => {
        const team = await createTeam();
        const list = await team.member.client.get("/workspaces");
        expect(list.body.data.workspaces).toEqual([expect.objectContaining({ id: team.workspace.id, role: "member", memberCount: 3 })]);
    });
});

describe("GET /workspaces/:id", () => {
    it("returns details and the active members", async () => {
        const team = await createTeam();
        const response = await team.admin.client.get(`/workspaces/${team.workspace.id}`);
        expect(response.status).toBe(200);
        expect(response.body.data.workspace.role).toBe("admin");
        expect(response.body.data.workspace.members.map((member: { role: string }) => member.role).sort()).toEqual(["admin", "member", "owner"]);
    });

    it("doesn't list removed members", async () => {
        const team = await createTeam();
        await prisma.membership.update({ where: { id: team.member.membership.id }, data: { status: "removed" } });
        const response = await team.owner.client.get(`/workspaces/${team.workspace.id}`);
        expect(response.body.data.workspace.members).toHaveLength(2);
    });

    it.each([["outsider"], ["bad id"]])("answers 404 for %s", async (variant) => {
        const team = await createTeam();
        const path = variant === "bad id" ? "/workspaces/not-a-uuid" : `/workspaces/${team.workspace.id}`;
        const client = variant === "bad id" ? team.owner.client : team.outsider.client;
        const response = await client.get(path);
        expect(response.status).toBe(404);
        expect(response.body.message).toBe("Workspace not found");
    });
});

describe("PATCH /workspaces/:id (rename)", () => {
    it("the Owner can rename", async () => {
        const team = await createTeam();
        const response = await team.owner.client.patch(`/workspaces/${team.workspace.id}`, { name: "Renamed" });
        expect(response.status).toBe(200);
        expect(response.body.data.workspace.name).toBe("Renamed");
    });

    it.each([["admin", 403], ["member", 403], ["outsider", 404]] as const)("%s → %i", async (who, status) => {
        const team = await createTeam();
        const response = await team[who].client.patch(`/workspaces/${team.workspace.id}`, { name: "Hijacked" });
        expect(response.status).toBe(status);
        await expect(prisma.workspace.findUniqueOrThrow({ where: { id: team.workspace.id } })).resolves.toMatchObject({ name: "Team Space" });
    });
});
