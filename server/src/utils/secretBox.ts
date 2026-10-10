import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import AppError from "./AppError.js";

// ─── Encryption at rest for small secrets (operator MFA seeds) ─────────────────────
// AES-256-GCM with a key that lives only in the environment (OPERATOR_MFA_KEY), so a
// database dump alone can't produce valid MFA codes. Stored as "iv.tag.ciphertext" (base64).

const KEY_ENV = "OPERATOR_MFA_KEY";

// The key: 32 bytes, given as 64 hex characters or base64. Read per call so tests can set it.
const encryptionKey = (): Buffer => {
    const raw = process.env[KEY_ENV]?.trim();
    if (!raw) throw new AppError("Operator access isn't configured on this server (OPERATOR_MFA_KEY is missing).", 503);
    const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (key.length !== 32) throw new AppError("Operator access is misconfigured (OPERATOR_MFA_KEY must be 32 bytes).", 503);
    return key;
};

export const encryptSecret = (plaintext: string): string => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64")).join(".");
};

export const decryptSecret = (stored: string): string => {
    const [iv, tag, ciphertext] = stored.split(".").map((part) => Buffer.from(part, "base64"));
    if (!iv || !tag || !ciphertext) throw new Error("Malformed encrypted secret");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
};
