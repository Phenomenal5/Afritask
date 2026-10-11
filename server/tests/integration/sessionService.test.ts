// Integration: access + refresh tokens against the real database.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import type { Request, Response } from "express";
import {
    ACCESS_TOKEN_COOKIE,
    REFRESH_COOKIE_PATH,
    REFRESH_TOKEN_COOKIE,
    findSessionForAccessToken,
    refreshSession,
    revokeAllSessions,
    revokeSession,
    startSession,
} from "../../src/services/sessionService.js";
import { signAccessToken } from "../../src/utils/accessToken.js";
import { hashSecureToken } from "../../src/utils/secureToken.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createUser } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

interface CapturedCookie {
    name: string;
    value: string;
    options: Record<string, unknown>;
}

// Minimal req/res doubles: capture the cookies the service sets.
const fakeRequest = () => ({ get: (header: string) => (header === "user-agent" ? "jest-agent" : undefined) }) as unknown as Request;
const fakeResponse = () => {
    const cookies: CapturedCookie[] = [];
    const response = {
        cookie: (name: string, value: string, options: Record<string, unknown>) => {
            cookies.push({ name, value, options });
            return response;
        },
    };
    return { response: response as unknown as Response, cookies };
};
const cookieNamed = (cookies: CapturedCookie[], name: string) => cookies.find((cookie) => cookie.name === name);

const startFor = async (userId: string) => {
    const { response, cookies } = fakeResponse();
    const sessionId = await startSession(fakeRequest(), response, userId);
    return {
        sessionId,
        accessToken: cookieNamed(cookies, ACCESS_TOKEN_COOKIE)!.value,
        refreshToken: cookieNamed(cookies, REFRESH_TOKEN_COOKIE)!.value,
        cookies,
    };
};

const refreshWith = async (refreshToken: string) => {
    const { response, cookies } = fakeResponse();
    const session = await refreshSession(response, refreshToken);
    return { session, cookies };
};

describe("startSession", () => {
    it("sets an access cookie for every path and a refresh cookie for the auth routes only", async () => {
        const user = await createUser();
        const { cookies } = await startFor(user.id);

        expect(cookieNamed(cookies, ACCESS_TOKEN_COOKIE)!.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 15 * 60 * 1000 });
        expect(cookieNamed(cookies, REFRESH_TOKEN_COOKIE)!.options).toMatchObject({ httpOnly: true, sameSite: "lax", path: REFRESH_COOKIE_PATH });
    });

    it("stores only the refresh token's hash, for 30 days", async () => {
        const user = await createUser();
        const { sessionId, refreshToken } = await startFor(user.id);

        const row = await prisma.session.findUniqueOrThrow({ where: { id: sessionId } });
        expect(row.secretHash).toBe(hashSecureToken(refreshToken));
        expect(row.secretHash).not.toBe(refreshToken);
        expect(row.userAgent).toBe("jest-agent");
        const daysLeft = (row.expiresAt.getTime() - Date.now()) / (24 * 3600 * 1000);
        expect(daysLeft).toBeGreaterThan(29.9);
        expect(daysLeft).toBeLessThanOrEqual(30);
    });
});

describe("findSessionForAccessToken", () => {
    it("finds the live session with its user (no password)", async () => {
        const user = await createUser();
        const { accessToken } = await startFor(user.id);
        const session = await findSessionForAccessToken(accessToken);
        expect(session?.user.id).toBe(user.id);
        expect(session?.user).not.toHaveProperty("password");
    });

    it("refuses tokens that are expired, forged, or whose session ended", async () => {
        const user = await createUser();
        const revoked = await startFor(user.id);
        await revokeSession(revoked.sessionId);
        const live = await startFor(user.id);

        const expired = signAccessToken({ userId: user.id, sessionId: live.sessionId }, process.env.ACCESS_TOKEN_SECRET!, -1000);
        const wrongKey = signAccessToken({ userId: user.id, sessionId: live.sessionId }, "an-attacker-chosen-secret-0123456789", 60_000);
        const [header, payload] = live.accessToken.split(".");
        const unsigned = `${header}.${payload}.`;

        await expect(findSessionForAccessToken(revoked.accessToken)).resolves.toBeNull();
        await expect(findSessionForAccessToken(expired)).resolves.toBeNull();
        await expect(findSessionForAccessToken(wrongKey)).resolves.toBeNull();
        await expect(findSessionForAccessToken(unsigned)).resolves.toBeNull();
        await expect(findSessionForAccessToken("not.a.token")).resolves.toBeNull();
    });
});

describe("refreshSession", () => {
    it("rotates the refresh token and issues a new access token", async () => {
        const user = await createUser();
        const started = await startFor(user.id);
        const loginExpiry = (await prisma.session.findUniqueOrThrow({ where: { id: started.sessionId } })).expiresAt;

        const { session, cookies } = await refreshWith(started.refreshToken);
        expect(session?.id).toBe(started.sessionId);
        const newRefreshToken = cookieNamed(cookies, REFRESH_TOKEN_COOKIE)!.value;
        expect(newRefreshToken).not.toBe(started.refreshToken);
        expect(cookieNamed(cookies, ACCESS_TOKEN_COOKIE)).toBeDefined();

        const row = await prisma.session.findUniqueOrThrow({ where: { id: started.sessionId } });
        expect(row.secretHash).toBe(hashSecureToken(newRefreshToken));
        // The login's 30 days don't restart on refresh.
        expect(row.expiresAt).toEqual(loginExpiry);
    });

    it("accepts the just-replaced token briefly (a second tab), without rotating again", async () => {
        const user = await createUser();
        const started = await startFor(user.id);
        await refreshWith(started.refreshToken);

        const secondTab = await refreshWith(started.refreshToken);
        expect(secondTab.session?.id).toBe(started.sessionId);
        expect(cookieNamed(secondTab.cookies, ACCESS_TOKEN_COOKIE)).toBeDefined();
        expect(cookieNamed(secondTab.cookies, REFRESH_TOKEN_COOKIE)).toBeUndefined();
    });

    it("refuses a replaced token once the grace minute is over", async () => {
        const user = await createUser();
        const started = await startFor(user.id);
        await refreshWith(started.refreshToken);
        await prisma.session.update({ where: { id: started.sessionId }, data: { rotatedAt: new Date(Date.now() - 5 * 60 * 1000) } });

        await expect(refreshWith(started.refreshToken)).resolves.toMatchObject({ session: null, cookies: [] });
    });

    it("refuses revoked, expired and unknown refresh tokens", async () => {
        const user = await createUser();
        const revoked = await startFor(user.id);
        await revokeSession(revoked.sessionId);
        const expired = await startFor(user.id);
        await prisma.session.update({ where: { id: expired.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });

        await expect(refreshWith(revoked.refreshToken)).resolves.toMatchObject({ session: null });
        await expect(refreshWith(expired.refreshToken)).resolves.toMatchObject({ session: null });
        await expect(refreshWith("not-a-real-token")).resolves.toMatchObject({ session: null });
    });
});

describe("revokeAllSessions", () => {
    it("can keep the current session", async () => {
        const user = await createUser();
        const current = await startFor(user.id);
        const otherDevice = await startFor(user.id);
        await revokeAllSessions(user.id, current.sessionId);

        await expect(findSessionForAccessToken(current.accessToken)).resolves.not.toBeNull();
        await expect(findSessionForAccessToken(otherDevice.accessToken)).resolves.toBeNull();
        await expect(refreshWith(otherDevice.refreshToken)).resolves.toMatchObject({ session: null });
    });

    it("only touches that user", async () => {
        const user = await createUser();
        const otherUser = await createUser();
        await startFor(user.id);
        const otherSession = await startFor(otherUser.id);
        await revokeAllSessions(user.id);
        await expect(findSessionForAccessToken(otherSession.accessToken)).resolves.not.toBeNull();
    });
});
