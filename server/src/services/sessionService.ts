import type { Request, Response } from "express";
import prisma from "../config/prisma.js";
import env from "../config/env.js";
import { generateSecureToken, hashSecureToken } from "../utils/secureToken.js";

// ─── Server-side sessions behind an httpOnly cookie ─────────────────────
// Replaces the old JWT-in-localStorage: JavaScript can't read the cookie (XSS can't
// steal it), and because each session is a database row it can be revoked —
// logout, password reset and (later) account suspension end access immediately.

export const SESSION_COOKIE_NAME = "afritask_session";

const sessionLifetimeMs = () => env.sessionTtlDays * 24 * 60 * 60 * 1000;

const cookieOptions = () => ({
    httpOnly: true,
    // NOTE: Lax is enough because the client reaches the API same-origin through its
    // /api rewrite. If the API is ever called cross-site again, this must become
    // "none" (+ secure) — and the CSRF header check becomes the only CSRF defence.
    sameSite: "lax" as const,
    secure: env.isProduction,
    path: "/",
});

// Create a session row and set its cookie. Returns the new session id.
export const startSession = async (req: Request, res: Response, userId: string) => {
    const rawSecret = generateSecureToken();
    const expiresAt = new Date(Date.now() + sessionLifetimeMs());

    const session = await prisma.session.create({
        data: {
            userId,
            secretHash: hashSecureToken(rawSecret),
            expiresAt,
            userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
        },
    });

    res.cookie(SESSION_COOKIE_NAME, rawSecret, { ...cookieOptions(), expires: expiresAt });
    return session.id;
};

export const clearSessionCookie = (res: Response) => {
    res.clearCookie(SESSION_COOKIE_NAME, cookieOptions());
};

// The live session (with its user) for a raw cookie value, or null.
export const findActiveSession = (rawSecret: string) =>
    prisma.session.findFirst({
        where: {
            secretHash: hashSecureToken(rawSecret),
            // NOTE: customer routes never accept an operator session, even if its secret is
            // replayed in the customer cookie — the two consoles stay separate (SRS SR16).
            kind: "customer",
            revokedAt: null,
            expiresAt: { gt: new Date() },
        },
        include: { user: true },
    });

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
