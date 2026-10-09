// Security: each sensitive endpoint has its OWN rate-limit budget.
// Separate file on purpose: Jest gives every file a fresh module registry, so the limiters
// start from zero here (in rateLimiting.test.ts earlier tests already spent the budgets).
import { afterAll, afterEach, beforeEach, describe, expect, it } from "@jest/globals";
import { createClient } from "../helpers/client.js";
import { disconnectDatabase, resetDatabase } from "../helpers/database.js";
import { createUser } from "../helpers/factories.js";

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

describe("rate-limit budgets are per endpoint", () => {
    it("each endpoint has its own budget (verify-link clicks don't eat the login budget)", async () => {
        await statusesOf(10, () => createClient().get("/auth/verify-email/0000"));
        const user = await createUser();
        const login = await createClient().post("/auth/login", { email: user.email, password: "correct-horse-1" });
        expect(login.status).toBe(200);
    });

});
