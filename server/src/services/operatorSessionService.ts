import type { Request, Response } from "express";
import prisma from "../config/prisma.js";
import env from "../config/env.js";
import { generateSecureToken, hashSecureToken } from "../utils/secureToken.js";

// ─── Operator (admin console) sessions ─────────────────────
// Same storage as customer sessions (only a hash in the Session table) but a different
// kind, cookie and lifetime, and the cookie is only ever sent to /api/admin. A customer
// cookie can't open the console and an operator cookie can't act in a workspace.

export const OPERATOR_COOKIE_NAME = "afritask_operator_session";
// Short-lived on purpose: an unattended console signs itself out within a working day.
const OPERATOR_SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

const cookieOptions = () => ({
    httpOnly: true,
    sameSite: "strict" as const,
    secure: env.isProduction,
    path: "/api/admin",
});

export const startOperatorSession = async (req: Request, res: Response, userId: string) => {
    const rawSecret = generateSecureToken();
    const expiresAt = new Date(Date.now() + OPERATOR_SESSION_LIFETIME_MS);
    const session = await prisma.session.create({
        data: {
            userId,
            kind: "operator",
            secretHash: hashSecureToken(rawSecret),
            expiresAt,
            userAgent: req.get("user-agent")?.slice(0, 300) ?? null,
        },
    });
    res.cookie(OPERATOR_COOKIE_NAME, rawSecret, { ...cookieOptions(), expires: expiresAt });
    return session;
};

export const clearOperatorCookie = (res: Response) => {
    res.clearCookie(OPERATOR_COOKIE_NAME, cookieOptions());
};

// The live operator session for a raw cookie value, with its user and grant — or null.
export const findOperatorSession = (rawSecret: string) =>
    prisma.session.findFirst({
        where: {
            secretHash: hashSecureToken(rawSecret),
            kind: "operator",
            revokedAt: null,
            expiresAt: { gt: new Date() },
            user: { suspendedAt: null },
        },
        include: { user: { include: { platformGrant: true } } },
    });
