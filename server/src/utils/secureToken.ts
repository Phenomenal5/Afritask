import { createHash, randomBytes } from "crypto";

// ─── Random secrets for cookies, email links and OAuth codes ─────────────────────
// The raw value goes to the browser/inbox; the database only ever sees the hash.
// SHA-256 (not bcrypt) is right here: the input is 256 random bits, so there is
// nothing to brute-force, and lookups by hash must be fast and deterministic.
// NOTE: the auth_sessions migration hashes legacy tokens with the same SHA-256 hex —
// change one and you must change the other.

export const generateSecureToken = () => randomBytes(32).toString("hex");

export const hashSecureToken = (rawToken: string) =>
    createHash("sha256").update(rawToken, "utf8").digest("hex");
