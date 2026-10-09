import prisma from "../config/prisma.js";
import type { AccountTokenPurpose } from "../generated/prisma/client.js";
import { generateSecureToken, hashSecureToken } from "../utils/secureToken.js";

// ─── Single-use account tokens (verify email, reset password, OAuth hand-off) ─────────────────────

// Issue a fresh token, retiring any earlier unused one for the same purpose —
// so "resend" always invalidates the previous link.
export const issueAccountToken = async (userId: string, purpose: AccountTokenPurpose, lifetimeMs: number) => {
    const rawToken = generateSecureToken();
    const now = new Date();

    await prisma.$transaction([
        prisma.accountToken.updateMany({
            where: { userId, purpose, usedAt: null },
            data: { usedAt: now },
        }),
        prisma.accountToken.create({
            data: {
                userId,
                purpose,
                tokenHash: hashSecureToken(rawToken),
                expiresAt: new Date(now.getTime() + lifetimeMs),
            },
        }),
    ]);

    return rawToken;
};

// Look a token up WITHOUT consuming it (any state). Used where the caller decides
// what an expired/used token means — e.g. idempotent email verification.
export const findAccountToken = (rawToken: string, purpose: AccountTokenPurpose) =>
    prisma.accountToken.findFirst({
        where: { tokenHash: hashSecureToken(rawToken), purpose },
        include: { user: true },
    });

// Atomically consume a live token. Returns its userId, or null if it was unknown,
// expired or already used. The conditional updateMany is the lock: of two
// concurrent requests with the same link, only one gets count === 1.
export const consumeAccountToken = async (rawToken: string, purpose: AccountTokenPurpose) => {
    const tokenHash = hashSecureToken(rawToken);
    const { count } = await prisma.accountToken.updateMany({
        where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
    });
    if (count === 0) return null;

    const consumedToken = await prisma.accountToken.findUnique({
        where: { tokenHash },
        select: { userId: true },
    });
    return consumedToken?.userId ?? null;
};

// Throw away a token we just issued but couldn't deliver (e.g. the email failed).
export const revokeAccountTokens = (userId: string, purpose: AccountTokenPurpose) =>
    prisma.accountToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: new Date() },
    });
