import { createHmac, timingSafeEqual } from "node:crypto";
import env from "../config/env.js";

// ─── Signed email links ─────────────────────
// For links that must work without signing in — confirming or leaving the newsletter.
// Nothing is stored: the signature proves we issued the link for exactly this subscriber
// and purpose. An unsubscribe link never expires (it has to keep working in old emails);
// a confirmation link does.
// NOTE: signed with the access-token secret (with the purpose mixed in, so a link for one
// purpose can't be replayed as another). Rotating ACCESS_TOKEN_SECRET therefore retires the
// links in already-sent emails — people can still opt out from Settings → Profile.

export type SignedLinkPurpose = "newsletter-confirm" | "newsletter-unsubscribe";

const signatureFor = (purpose: SignedLinkPurpose, subjectId: string, expires: string) =>
    createHmac("sha256", env.accessTokenSecret).update(`signed-link:${purpose}:${subjectId}:${expires}`).digest("base64url");

// `expires` is epoch milliseconds as a string, or "" for a link that never expires.
export const signLink = (purpose: SignedLinkPurpose, subjectId: string, expiresAt?: Date) => {
    const expires = expiresAt ? String(expiresAt.getTime()) : "";
    return { expires, signature: signatureFor(purpose, subjectId, expires) };
};

export const verifyLink = (purpose: SignedLinkPurpose, subjectId: unknown, signature: unknown, expires: unknown = "") => {
    if (typeof subjectId !== "string" || typeof signature !== "string" || typeof expires !== "string") return false;
    if (expires && !(Number(expires) > Date.now())) return false;
    const expected = Buffer.from(signatureFor(purpose, subjectId, expires));
    const presented = Buffer.from(signature);
    return presented.length === expected.length && timingSafeEqual(presented, expected);
};
