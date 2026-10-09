// Integration: server-side sessions against the real database.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import type { Request, Response } from "express";
import {
    SESSION_COOKIE_NAME,
    findActiveSession,
    revokeAllSessions,
    revokeSession,
    startSession,
} from "../../src/services/sessionService.js";
import { hashSecureToken } from "../../src/utils/secureToken.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createUser } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

// Minimal req/res doubles: capture the cookie startSession sets.
const fakeRequest = () => ({ get: (header: string) => (header === "user-agent" ? "jest-agent" : undefined) }) as unknown as Request;
const fakeResponse = () => {
    const cookies: { name: string; value: string; options: Record<string, unknown> }[] = [];
    const response = {
        cookie: (name: string, value: string, options: Record<string, unknown>) => {
            cookies.push({ name, value, options });
            return response;
        },
    };
    return { response: response as unknown as Response, cookies };
};

const startFor = async (userId: string) => {
    const { response, cookies } = fakeResponse();
    const sessionId = await startSession(fakeRequest(), response, userId);
    return { sessionId, secret: cookies[0]!.value, cookie: cookies[0]! };
};

describe("sessionService", () => {
    it("sets an httpOnly, SameSite=Lax cookie and stores only the secret's hash", async () => {
        const user = await createUser();
        const { sessionId, secret, cookie } = await startFor(user.id);

        expect(cookie.name).toBe(SESSION_COOKIE_NAME);
        expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
        const row = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
        expect(row.secretHash).toBe(hashSecureToken(secret));
        expect(row.secretHash).not.toBe(secret);
        expect(row.userAgent).toBe("jest-agent");
    });

    it("finds a live session with its user (no password)", async () => {
        const user = await createUser();
        const { secret } = await startFor(user.id);
        const session = await findActiveSession(secret);
        expect(session?.user.id).toBe(user.id);
        expect(session?.user).not.toHaveProperty("password");
    });

    it("doesn't find revoked, expired or unknown sessions", async () => {
        const user = await createUser();
        const revoked = await startFor(user.id);
        await revokeSession(revoked.sessionId);
        const expired = await startFor(user.id);
        await prisma.session.update({ where: { id: expired.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });

        await expect(findActiveSession(revoked.secret)).resolves.toBeNull();
        await expect(findActiveSession(expired.secret)).resolves.toBeNull();
        await expect(findActiveSession("not-a-real-secret")).resolves.toBeNull();
    });

    it("revokeAllSessions can keep the current one", async () => {
        const user = await createUser();
        const current = await startFor(user.id);
        const otherDevice = await startFor(user.id);
        await revokeAllSessions(user.id, current.sessionId);

        await expect(findActiveSession(current.secret)).resolves.not.toBeNull();
        await expect(findActiveSession(otherDevice.secret)).resolves.toBeNull();
    });

    it("revokeAllSessions only touches that user", async () => {
        const user = await createUser();
        const otherUser = await createUser();
        await startFor(user.id);
        const otherSession = await startFor(otherUser.id);
        await revokeAllSessions(user.id);
        await expect(findActiveSession(otherSession.secret)).resolves.not.toBeNull();
    });
});
