// Security: brute-force and inbox-flooding protection on sensitive endpoints.
// Rate limits are skipped in other test files; this one turns them on (checked per request).
// NOTE: limiter counters live for the whole file (15-minute window), so tests here run in
// order against the same budgets. Budget-independence lives in its own file for fresh counters.
import { afterAll, afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createClient } from "../helpers/client.js";
import { disconnectDatabase, resetDatabase } from "../helpers/database.js";
import { createSignedInUser, createUser, uniqueEmail } from "../helpers/factories.js";

beforeEach(async () => {
    await resetDatabase();
    process.env.RATE_LIMITS_IN_TESTS = "on";
});
afterEach(() => {
    delete process.env.RATE_LIMITS_IN_TESTS;
});
afterAll(disconnectDatabase);

const statusesOf = async (count: number, request: () => Promise<{ status: number }>) => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < count; attempt += 1) statuses.push((await request()).status);
    return statuses;
};

describe("rate limits", () => {
    it("login: 10 attempts per 15 minutes, then 429 — even with the right password", async () => {
        const user = await createUser();
        const statuses = await statusesOf(10, () => createClient().post("/auth/login", { email: user.email, password: "wrong-pass" }));
        expect(statuses.every((status) => status === 401)).toBe(true);

        const blocked = await createClient().post("/auth/login", { email: user.email, password: "correct-horse-1" });
        expect(blocked.status).toBe(429);
        expect(blocked.body.message).toContain("Too many attempts");
        expect(blocked.headers["ratelimit-policy"] ?? blocked.headers["ratelimit"]).toBeDefined();
    });

    it("forgot-password: 5 per 15 minutes (stops inbox flooding)", async () => {
        const statuses = await statusesOf(6, () => createClient().post("/auth/forgot-password", { email: uniqueEmail() }));
        expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    });

    it("invitation sending has its own, larger budget", async () => {
        const { client, user } = await createSignedInUser();
        void user;
        const workspace = await client.post("/workspaces", { name: "W" });
        const workspaceId = workspace.body.data.workspace.id;
        const statuses = await statusesOf(12, () => client.post(`/workspaces/${workspaceId}/invitations`, { email: uniqueEmail() }));
        expect(statuses.every((status) => status === 201)).toBe(true);
        // NOTE: 12 sequential invitations, each several round trips to the remote test
        // database, can exceed Jest's 60s default on a slow link — the limit isn't the point.
    }, 180_000);
});
