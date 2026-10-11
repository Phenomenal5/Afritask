// API: operational behaviour — health probes, request ids, and secrets kept out of logs.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { anonymous, createClient } from "../helpers/client.js";
import { disconnectDatabase, resetDatabase } from "../helpers/database.js";
import { redactUrl } from "../../src/middlewares/requestId.middleware.js";
import { closeHealthConnections } from "../../src/controllers/health.controller.js";

beforeEach(resetDatabase);
afterAll(async () => {
    await closeHealthConnections();
    await disconnectDatabase();
});

describe("health checks", () => {
    it("liveness answers without signing in, and reveals nothing sensitive", async () => {
        const response = await anonymous().get("/api/health");
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ status: "ok" });
        expect(Object.keys(response.body).sort()).toEqual(["status", "uptimeSeconds", "version"]);
    });

    it("readiness checks the database and Redis", async () => {
        const response = await anonymous().get("/api/health/ready");
        // Redis may not run where tests do; either way the shape is fixed and has no details.
        expect([200, 503]).toContain(response.status);
        expect(response.body.checks.database).toEqual({ status: "ok", latencyMs: expect.any(Number) });
        expect(Object.keys(response.body.checks).sort()).toEqual(["database", "redis"]);
        expect(JSON.stringify(response.body)).not.toMatch(/postgres|neon|redis:\/\/|password/i);
    });
});

describe("request ids", () => {
    it("every response carries one; a sane incoming id is kept, anything else replaced", async () => {
        const generated = await anonymous().get("/api/health");
        expect(generated.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);

        const kept = await anonymous().get("/api/health").set("X-Request-Id", "trace-abc-12345");
        expect(kept.headers["x-request-id"]).toBe("trace-abc-12345");

        // Spaces and markup could forge or garble log lines — replaced, not echoed.
        const hostile = await anonymous().get("/api/health").set("X-Request-Id", "bad id <script> INJECTED");
        expect(hostile.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    });
});

describe("log redaction", () => {
    it("removes tokens from paths and query strings", () => {
        expect(redactUrl("/api/invitations/preview/abc123secret")).toBe("/api/invitations/preview/[redacted]");
        expect(redactUrl("/api/auth/verify-email/tok_9f8e?x=1")).toBe("/api/auth/verify-email/[redacted]?x=1");
        expect(redactUrl("/api/auth/reset-password/zzz")).toBe("/api/auth/reset-password/[redacted]");
        expect(redactUrl("/auth/callback?code=one-time&state=ok")).toBe("/auth/callback?code=[redacted]&state=ok");
        expect(redactUrl("/api/tasks?token=a&q=keep")).toBe("/api/tasks?token=[redacted]&q=keep");
        expect(redactUrl("/api/workspaces/123/tasks?q=invoice")).toBe("/api/workspaces/123/tasks?q=invoice");
    });
});
