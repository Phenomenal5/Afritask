import type { Request, Response } from "express";
import prisma from "../config/prisma.js";
import env from "../config/env.js";
import { generateSecureToken, hashSecureToken } from "../utils/secureToken.js";
import { signAccessToken, verifyAccessToken } from "../utils/accessToken.js";
import AppError from "../utils/AppError.js";

// ─── Access + refresh tokens, both in httpOnly cookies ─────────────────────
// Refresh token: a random secret whose HASH is a Session row — 30 days, revocable
//   (logout, password reset, suspension), rotated every time it's used. Its cookie is
//   scoped to the auth routes, so it isn't sent with ordinary API requests.
// Access token: a signed JWT naming its session — 15 minutes, sent with every request.
// JavaScript can read neither cookie (XSS can't steal them); nothing goes in localStorage.

export const ACCESS_TOKEN_COOKIE = "afritask_access";
export const REFRESH_TOKEN_COOKIE = "afritask_refresh";
// NOTE: covers /auth/refresh and /auth/logout — the only routes that need the refresh token.
export const REFRESH_COOKIE_PATH = "/api/auth";

// A refresh token that was JUST rotated still works for this long. Two tabs refreshing at
// the same moment both send the old token; without this, the slower one would be signed out.
const ROTATION_GRACE_MS = 60 * 1000;

const accessTokenLifetimeMs = () => env.accessTokenTtlMinutes * 60 * 1000;
const refreshTokenLifetimeMs = () => env.refreshTokenTtlDays * 24 * 60 * 60 * 1000;

const baseCookieOptions = () => ({
    httpOnly: true,
    // NOTE: Lax is enough because the client reaches the API same-origin through its
    // /api rewrite. If the API is ever called cross-site again, this must become
    // "none" (+ secure) — and the CSRF header check becomes the only CSRF defence.
    sameSite: "lax" as const,
    secure: env.isProduction,
});

const setAccessCookie = (res: Response, userId: string, sessionId: string) => {
    const lifetimeMs = accessTokenLifetimeMs();
    const accessToken = signAccessToken({ userId, sessionId }, env.accessTokenSecret, lifetimeMs);
    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, { ...baseCookieOptions(), path: "/", maxAge: lifetimeMs });
};

const setRefreshCookie = (res: Response, rawSecret: string, expiresAt: Date) => {
    res.cookie(REFRESH_TOKEN_COOKIE, rawSecret, { ...baseCookieOptions(), path: REFRESH_COOKIE_PATH, expires: expiresAt });
};

export const clearAuthCookies = (res: Response) => {
    res.clearCookie(ACCESS_TOKEN_COOKIE, { ...baseCookieOptions(), path: "/" });
    res.clearCookie(REFRESH_TOKEN_COOKIE, { ...baseCookieOptions(), path: REFRESH_COOKIE_PATH });
};

// What makes a customer session usable — shared by the access and refresh checks.
const activeCustomerSession = () => ({
    // NOTE: customer routes never accept an operator session, even if its secret is
    // replayed in the customer cookie — the two consoles stay separate (SRS SR16).
    kind: "customer" as const,
    revokedAt: null,
    expiresAt: { gt: new Date() },
    user: { suspendedAt: null },
});

export const ACCOUNT_SUSPENDED_MESSAGE = "This account has been suspended. Contact Afritask support if you think this is a mistake.";

// ─── Sign in ─────────────────────
// Create the session (= refresh token) and set both cookies. Returns the new session id.
export const startSession = async (req: Request, res: Response, userId: string) => {
    // NOTE: the one place every sign-in path (password, Google hand-off) creates a session —
    // a suspended account is refused here, whatever route it came through (SRS SR17).
    const account = await prisma.user.findUnique({ where: { id: userId }, select: { suspendedAt: true } });
    if (account?.suspendedAt) throw new AppError(ACCOUNT_SUSPENDED_MESSAGE, 403);
    const rawSecret = generateSecureToken();
    const expiresAt = new Date(Date.now() + refreshTokenLifetimeMs());

    const session = await prisma.session.create({
        data: {
            userId,
            secretHash: hashSecureToken(rawSecret),
            expiresAt,
            userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
        },
    });

    setRefreshCookie(res, rawSecret, expiresAt);
    setAccessCookie(res, userId, session.id);
    return session.id;
};

// ─── Every request ─────────────────────
// The live session (with its user) behind an access token, or null.
// NOTE: the token's signature and expiry are checked first, then its session row. That one
// lookup (needed anyway for req.user) is what makes logout, password reset and suspension
// take effect immediately instead of up to 15 minutes later.
export const findSessionForAccessToken = async (accessToken: string) => {
    const claims = verifyAccessToken(accessToken, env.accessTokenSecret);
    if (!claims) return null;
    return prisma.session.findFirst({
        where: { id: claims.sessionId, userId: claims.userId, ...activeCustomerSession() },
        include: { user: true },
    });
};

// ─── Refresh ─────────────────────
// Trade a refresh token for a new access token, rotating the refresh token. Returns the
// session, or null when the refresh token is unknown, expired, revoked or long replaced.
export const refreshSession = async (res: Response, rawSecret: string) => {
    const presentedHash = hashSecureToken(rawSecret);

    const session = await prisma.session.findFirst({
        where: { secretHash: presentedHash, ...activeCustomerSession() },
    });
    if (session) {
        const nextSecret = generateSecureToken();
        // Conditional on the hash still being the one presented: of two concurrent refreshes,
        // only one rotates; the other falls through to the grace path below.
        const rotated = await prisma.session.updateMany({
            where: { id: session.id, secretHash: presentedHash },
            data: { secretHash: hashSecureToken(nextSecret), previousSecretHash: presentedHash, rotatedAt: new Date() },
        });
        if (rotated.count === 1) {
            setRefreshCookie(res, nextSecret, session.expiresAt);
            setAccessCookie(res, session.userId, session.id);
            return session;
        }
    }

    // Just rotated by a parallel request: issue an access token, leave the refresh cookie
    // alone — the browser already holds the new one from that other response.
    const recentlyRotated = await prisma.session.findFirst({
        where: {
            previousSecretHash: presentedHash,
            rotatedAt: { gt: new Date(Date.now() - ROTATION_GRACE_MS) },
            ...activeCustomerSession(),
        },
    });
    if (!recentlyRotated) return null;
    setAccessCookie(res, recentlyRotated.userId, recentlyRotated.id);
    return recentlyRotated;
};

// The session a refresh token belongs to (current or just-rotated), for logout.
export const findSessionIdForRefreshToken = async (rawSecret: string) => {
    const presentedHash = hashSecureToken(rawSecret);
    const session = await prisma.session.findFirst({
        where: { OR: [{ secretHash: presentedHash }, { previousSecretHash: presentedHash }], kind: "customer" },
        select: { id: true },
    });
    return session?.id ?? null;
};

// ─── Revoke ─────────────────────
export const revokeSession = (sessionId: string) =>
    prisma.session.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
    });

// Sign the user out everywhere — optionally keeping the session making the request.
export const revokeAllSessions = (userId: string, keepSessionId?: string) =>
    prisma.session.updateMany({
        where: {
            userId,
            revokedAt: null,
            ...(keepSessionId && { id: { not: keepSessionId } }),
        },
        data: { revokedAt: new Date() },
    });
