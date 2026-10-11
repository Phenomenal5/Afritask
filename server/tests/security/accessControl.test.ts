// Security: authentication, CSRF and tenant isolation, checked across EVERY route.
// The route list comes from the OpenAPI spec (which a unit test keeps equal to the real
// routes), so a newly added route is covered here automatically.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import openApiDocument from "../../src/docs/openapi.js";
import { anonymous, createClient } from "../helpers/client.js";
import { disconnectDatabase, resetDatabase } from "../helpers/database.js";
import { createProject, createSignedInUser, createTask, createTeam, uniqueEmail } from "../helpers/factories.js";
import { ACCESS_TOKEN_COOKIE } from "../../src/services/sessionService.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

type Operation = { method: string; path: string; isPublic: boolean };

const operations: Operation[] = Object.entries(openApiDocument.paths).flatMap(([path, pathItem]) =>
    Object.entries(pathItem as Record<string, { security?: unknown[] }>)
        .filter(([method]) => ["get", "post", "put", "patch", "delete"].includes(method))
        .map(([method, operation]) => ({ method, path, isPublic: Array.isArray(operation.security) && operation.security.length === 0 }))
);

// Fill {params} with well-formed but non-existent ids.
// Spec paths are relative to /api/v1 — except the unversioned health checks.
const concretePath = (path: string) => `${path.startsWith("/health") ? "/api" : "/api/v1"}${path.replace(/\{[^}]+\}/g, () => randomUUID())}`;

const send = (agent: ReturnType<typeof anonymous>, operation: Operation, headers: Record<string, string>) =>
    (agent as unknown as Record<string, (path: string) => { set: (headers: Record<string, string>) => Promise<{ status: number; body: { message?: string } }> }>)
        [operation.method]!(concretePath(operation.path))
        .set(headers);

describe("authentication on every protected route", () => {
    const protectedOperations = operations.filter((operation) => !operation.isPublic);

    it("covers the protected routes (sanity)", () => expect(protectedOperations.length).toBeGreaterThan(25));

    it.each(protectedOperations.map((operation) => [`${operation.method.toUpperCase()} ${operation.path}`, operation]))(
        "%s → 401 without a session",
        async (_label, operation) => {
            const response = await send(anonymous(), operation as Operation, { "X-Requested-With": "XMLHttpRequest" });
            expect(response.status).toBe(401);
        }
    );

    it.each([
        ["a forged cookie", `${ACCESS_TOKEN_COOKIE}=${"a".repeat(64)}`],
        ["an empty cookie", `${ACCESS_TOKEN_COOKIE}=`],
        ["an injection attempt", `${ACCESS_TOKEN_COOKIE}=' OR '1'='1`],
        // {"alg":"none"} — the classic JWT bypass; the algorithm is never read from the token.
        ["an unsigned alg:none token", `${ACCESS_TOKEN_COOKIE}=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ4Iiwic2lkIjoieCIsInR5cCI6ImFjY2VzcyIsImV4cCI6OTk5OTk5OTk5OX0.`],
    ])("rejects %s", async (_label, cookie) => {
        const response = await anonymous().get("/api/v1/auth/me").set("Cookie", cookie);
        expect(response.status).toBe(401);
    });

    it("ignores the old Authorization: Bearer scheme entirely", async () => {
        const response = await anonymous().get("/api/v1/workspaces").set("Authorization", "Bearer eyJhbGciOiJIUzI1NiJ9.e30.x");
        expect(response.status).toBe(401);
    });
});

describe("CSRF: every write requires X-Requested-With", () => {
    // The one deliberate exception: RFC 8058 one-click unsubscribe, which mail apps POST with no
    // custom headers. It uses no cookie, only the link's signature (see csrf.middleware.ts).
    const CSRF_EXEMPT = new Set(["post /newsletter/unsubscribe"]);
    const writes = operations.filter((operation) => operation.method !== "get" && !CSRF_EXEMPT.has(`${operation.method} ${operation.path}`));

    it.each(writes.map((operation) => [`${operation.method.toUpperCase()} ${operation.path}`, operation]))(
        "%s → 403 without the header, even with a valid session",
        async (_label, operation) => {
            const { client } = await createSignedInUser();
            const response = await send(anonymous(), operation as Operation, { Cookie: `${ACCESS_TOKEN_COOKIE}=${client.accessToken}` });
            expect(response.status).toBe(403);
            expect(response.body.message).toBe("Missing X-Requested-With header");
        }
    );

    it("reads (GET) don't need it", async () => {
        const { client } = await createSignedInUser();
        const response = await anonymous().get("/api/v1/workspaces").set("Cookie", `${ACCESS_TOKEN_COOKIE}=${client.accessToken}`);
        expect(response.status).toBe(200);
    });
});

describe("tenant isolation (IDOR): an outsider with a valid session", () => {
    it("gets 404 — never data, never a 403 that confirms existence — on every resource of another workspace", async () => {
        const team = await createTeam();
        const project = await createProject(team.workspace.id, team.owner.user.id);
        const task = await createTask(team.workspace.id, team.owner.user.id, { projectId: project.id });
        const invitation = await team.owner.client.post(`/workspaces/${team.workspace.id}/invitations`, { email: uniqueEmail() });
        const invitationId = invitation.body.data.invitation.id;
        const workspaceId = team.workspace.id;
        const memberId = team.member.membership.id;
        const outsider = team.outsider.client;

        const attempts: [string, () => Promise<{ status: number; body: unknown }>][] = [
            ["read workspace", () => outsider.get(`/workspaces/${workspaceId}`)],
            ["rename workspace", () => outsider.patch(`/workspaces/${workspaceId}`, { name: "pwned" })],
            ["list tasks", () => outsider.get(`/workspaces/${workspaceId}/tasks`)],
            ["create task", () => outsider.post(`/workspaces/${workspaceId}/tasks`, { title: "x" })],
            ["read task", () => outsider.get(`/tasks/${task.id}`)],
            ["edit task", () => outsider.put(`/tasks/${task.id}`, { title: "x", version: 1 })],
            ["change task status", () => outsider.patch(`/tasks/${task.id}/status`, { status: "completed", version: 1 })],
            ["delete task", () => outsider.delete(`/tasks/${task.id}`)],
            ["list projects", () => outsider.get(`/workspaces/${workspaceId}/projects`)],
            ["create project", () => outsider.post(`/workspaces/${workspaceId}/projects`, { name: "x" })],
            ["read project", () => outsider.get(`/projects/${project.id}`)],
            ["edit project", () => outsider.patch(`/projects/${project.id}`, { name: "x" })],
            ["archive project", () => outsider.post(`/projects/${project.id}/archive`)],
            ["list invitations", () => outsider.get(`/workspaces/${workspaceId}/invitations`)],
            ["invite someone", () => outsider.post(`/workspaces/${workspaceId}/invitations`, { email: uniqueEmail() })],
            ["resend invitation", () => outsider.post(`/invitations/${invitationId}/resend`)],
            ["revoke invitation", () => outsider.post(`/invitations/${invitationId}/revoke`)],
            ["change a role", () => outsider.patch(`/workspaces/${workspaceId}/members/${memberId}`, { role: "admin" })],
            ["remove a member", () => outsider.delete(`/workspaces/${workspaceId}/members/${memberId}`)],
            ["transfer ownership", () => outsider.post(`/workspaces/${workspaceId}/transfer-ownership`, { membershipId: memberId })],
            ["leave", () => outsider.post(`/workspaces/${workspaceId}/leave`)],
        ];

        for (const [label, attempt] of attempts) {
            const response = await attempt();
            expect({ label, status: response.status }).toEqual({ label, status: 404 });
            expect(JSON.stringify(response.body)).not.toContain(task.title);
        }
    });

    it("can't attach another workspace's project or member to its own tasks", async () => {
        const team = await createTeam();
        const project = await createProject(team.workspace.id, team.owner.user.id);
        const { workspace: ownWorkspace } = await (await import("../helpers/factories.js")).createWorkspace(team.outsider.user.id);
        const intoForeignProject = await team.outsider.client.post(`/workspaces/${ownWorkspace.id}/tasks`, { title: "x", projectId: project.id });
        const toForeignMember = await team.outsider.client.post(`/workspaces/${ownWorkspace.id}/tasks`, { title: "x", assigneeMembershipId: team.member.membership.id });
        expect(intoForeignProject.status).toBe(400);
        expect(toForeignMember.status).toBe(400);
    });

    it("a removed member loses access to links they kept", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.member.user.id);
        await team.owner.client.delete(`/workspaces/${team.workspace.id}/members/${team.member.membership.id}`);
        await expect(team.member.client.get(`/tasks/${task.id}`)).resolves.toMatchObject({ status: 404 });
        await expect(team.member.client.get(`/workspaces/${team.workspace.id}/tasks`)).resolves.toMatchObject({ status: 404 });
    });

    it("signing in doesn't grant anything without membership (fresh account sees nothing)", async () => {
        await createTeam();
        const stranger = createClient();
        const { user } = await createSignedInUser();
        void stranger;
        void user;
        const { client } = await createSignedInUser();
        await expect(client.get("/workspaces")).resolves.toMatchObject({ body: { results: 0 } });
    });
});
