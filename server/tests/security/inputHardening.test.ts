// Security: hostile input — injection, mass assignment, oversized/malformed bodies, uploads.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { anonymous, createClient } from "../helpers/client.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createSignedInUser, createTask, createTeam, createUser, uniqueEmail } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

describe("query/filter injection", () => {
    // NOTE: Prisma reads an OBJECT in a where clause as an operator ({ not: "" } matches
    // everyone) — the controllers must refuse non-string credentials outright.
    it.each([
        ["login with an operator object as email", "/auth/login", { email: { not: "" }, password: "x" }, 400],
        ["login with an array as email", "/auth/login", { email: ["a@b.co"], password: "x" }, 400],
        ["forgot-password with an operator object", "/auth/forgot-password", { email: { contains: "@" } }, 400],
        ["signup with an operator object", "/auth/signup", { name: "x", email: { not: "" }, password: "secret123" }, 400],
        ["Google exchange with an object code", "/auth/google/exchange", { code: { not: "" } }, 400],
    ])("%s → %i", async (_label, route, body, status) => {
        await createUser();
        const response = await createClient().post(route, body);
        expect(response.status).toBe(status);
        const setCookies = (response.headers["set-cookie"] ?? []) as unknown as string[];
        expect(setCookies.join("")).not.toMatch(/afritask_(access|refresh)=/);
    });

    it("accepting an invitation with an operator object is refused", async () => {
        const { client } = await createSignedInUser();
        await expect(client.post("/invitations/accept", { token: { not: "" } })).resolves.toMatchObject({ status: 400 });
    });

    it("stores SQL-looking text literally (parameterised queries)", async () => {
        const team = await createTeam();
        const nasty = `Robert'); DROP TABLE "Task";-- `;
        const response = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: nasty, description: "1' OR '1'='1" });
        expect(response.status).toBe(201);
        expect(response.body.data.task.title).toBe(nasty.trim());
        await expect(prisma.task.count()).resolves.toBe(1);
    });

    it("ignores operator-shaped and unknown query parameters", async () => {
        const team = await createTeam();
        await createTask(team.workspace.id, team.owner.user.id);
        for (const query of ["?status[$ne]=x", "?sort=title;DROP TABLE x", "?projectId[not]=1", "?sort=password"]) {
            const response = await team.owner.client.get(`/workspaces/${team.workspace.id}/tasks${query}`);
            expect({ query, status: response.status }).toEqual({ query, status: 200 });
        }
    });

    it("refuses malformed filter values with 400 rather than matching anything", async () => {
        const team = await createTeam();
        const response = await team.owner.client.get(`/workspaces/${team.workspace.id}/tasks?assignee=' OR 1=1`);
        expect(response.status).toBe(400);
    });

    it("rejects path-traversal-looking ids", async () => {
        const team = await createTeam();
        await expect(team.owner.client.get("/tasks/..%2F..%2Fetc%2Fpasswd")).resolves.toMatchObject({ status: 400 });
    });
});

describe("mass assignment — fields a client must not be able to set", () => {
    it("signup can't make itself verified, an admin, or a Google account", async () => {
        const email = uniqueEmail();
        // acceptTerms so the signup itself succeeds — what matters is which extra fields stick.
        await createClient().post("/auth/signup", { name: "Mallory", email, password: "secret123", acceptTerms: true, role: "admin", isVerified: true, provider: "google", providerId: "x" });
        const user = await prisma.user.findUniqueOrThrow({ where: { email } });
        expect(user).toMatchObject({ role: "user", isVerified: false, provider: "local", providerId: null });
    });

    it("profile update can't change email, role, verification or password", async () => {
        const { user, client } = await createSignedInUser();
        const passwordHashBefore = (await prisma.user.findUniqueOrThrow({ where: { id: user.id }, omit: { password: false } })).password;
        await client.put("/users/profile", { email: "hijack@afritask.invalid", role: "admin", isVerified: false, password: "new-password", name: "Still Me" });
        const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, omit: { password: false } });
        expect(saved).toMatchObject({ email: user.email, role: "user", isVerified: true, name: "Still Me" });
        expect(saved.password).toBe(passwordHashBefore);
    });

    it("task create ignores creatorId, workspaceId, version and completedAt from the body", async () => {
        const team = await createTeam();
        const otherTeam = await createTeam();
        const response = await team.member.client.post(`/workspaces/${team.workspace.id}/tasks`, {
            title: "x",
            creatorId: team.owner.user.id,
            workspaceId: otherTeam.workspace.id,
            version: 99,
            completedAt: "2020-01-01T00:00:00Z",
            id: "11111111-1111-4111-8111-111111111111",
        });
        expect(response.body.data.task).toMatchObject({ creatorId: team.member.user.id, workspaceId: team.workspace.id, version: 1, completedAt: null });
        expect(response.body.data.task.id).not.toBe("11111111-1111-4111-8111-111111111111");
    });

    it("task edit can't move a task to another workspace or change its author", async () => {
        const team = await createTeam();
        const otherTeam = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);
        await team.owner.client.put(`/tasks/${task.id}`, { title: "x", version: 1, workspaceId: otherTeam.workspace.id, creatorId: otherTeam.owner.user.id });
        await expect(prisma.task.findUniqueOrThrow({ where: { id: task.id } })).resolves.toMatchObject({ workspaceId: team.workspace.id, creatorId: team.owner.user.id });
    });

    it("project create ignores state/workspaceId; invitation create ignores status", async () => {
        const team = await createTeam();
        const project = await team.owner.client.post(`/workspaces/${team.workspace.id}/projects`, { name: "P", state: "archived", workspaceId: "x", createdById: team.member.user.id });
        expect(project.body.data.project).toMatchObject({ state: "active", workspaceId: team.workspace.id, createdById: team.owner.user.id });
        const invitation = await team.owner.client.post(`/workspaces/${team.workspace.id}/invitations`, { email: uniqueEmail(), status: "accepted" });
        expect(invitation.body.data.invitation.status).toBe("pending");
    });

    it("workspace create can't seed members or roles", async () => {
        const { user, client } = await createSignedInUser();
        const victim = await createUser();
        const response = await client.post("/workspaces", { name: "W", memberships: { create: { userId: victim.id, role: "owner" } }, role: "member" });
        expect(response.body.data.workspace.role).toBe("owner");
        const memberships = await prisma.membership.findMany({ where: { workspaceId: response.body.data.workspace.id } });
        expect(memberships.map((membership) => membership.userId)).toEqual([user.id]);
    });
});

describe("request size and shape", () => {
    it("rejects a JSON body over the 100 KB limit with 413 (not a 500)", async () => {
        const response = await createClient().post("/auth/login", { email: "a@b.co", password: "x".repeat(120_000) });
        expect(response.status).toBe(413);
    });

    it("rejects malformed JSON with 400", async () => {
        const response = await anonymous().post("/api/auth/login").set("X-Requested-With", "XMLHttpRequest").set("Content-Type", "application/json").send('{"email": "a@b.co", ');
        expect(response.status).toBe(400);
        expect(response.body.message).toBe("Request body is not valid JSON");
    });

    it("never echoes internal error details", async () => {
        const response = await anonymous().post("/api/auth/login").set("X-Requested-With", "XMLHttpRequest").set("Content-Type", "application/json").send("{bad");
        expect(JSON.stringify(response.body)).not.toMatch(/stack|at .*\.ts|SyntaxError/);
    });
});

describe("uploads", () => {
    const uploadDirectory = path.resolve("public/uploads/profile");
    const before = new Set(existsSync(uploadDirectory) ? readdirSync(uploadDirectory) : []);
    afterAll(() => {
        for (const file of readdirSync(uploadDirectory)) if (!before.has(file)) unlinkSync(path.join(uploadDirectory, file));
    });

    it("never uses the client's filename (no path traversal)", async () => {
        const { client } = await createSignedInUser();
        const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
        const response = await client.raw("put", "/users/profile").attach("photo", png, { filename: "../../../src/app.png", contentType: "image/png" });
        expect(response.status).toBe(200);
        expect(response.body.user.photo).toMatch(/^\/uploads\/profile\/user-[0-9a-f-]{36}\.png$/);
    });

    it("rejects an executable disguised with an image MIME type but a script extension", async () => {
        const { client } = await createSignedInUser();
        const response = await client.raw("put", "/users/profile").attach("photo", Buffer.from("<?php system($_GET['c']); ?>"), { filename: "shell.php", contentType: "image/png" });
        expect(response.status).toBe(400);
    });
});
