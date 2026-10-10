import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// ─── Time-based one-time passwords (RFC 6238 / RFC 4226) ─────────────────────
// The 6-digit codes authenticator apps (Google Authenticator, 1Password, Authy…) show for
// operator MFA. Built on node:crypto — no dependency for ~40 lines of well-specified maths.
// Defaults every app understands: SHA-1, 6 digits, 30-second steps.

const STEP_SECONDS = 30;
const DIGITS = 6;
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const base32Encode = (bytes: Buffer): string => {
    let bits = "";
    for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
    let encoded = "";
    for (let index = 0; index < bits.length; index += 5) {
        encoded += BASE32_ALPHABET[parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
    }
    return encoded;
};

export const base32Decode = (encoded: string): Buffer => {
    const cleaned = encoded.replace(/[\s=-]/g, "").toUpperCase();
    let bits = "";
    for (const character of cleaned) {
        const value = BASE32_ALPHABET.indexOf(character);
        if (value === -1) throw new Error("Invalid base32 secret");
        bits += value.toString(2).padStart(5, "0");
    }
    const bytes: number[] = [];
    for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
    return Buffer.from(bytes);
};

// 20 random bytes (160 bits), as RFC 4226 recommends.
export const generateTotpSecret = (): string => base32Encode(randomBytes(20));

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_SECONDS);

// HOTP: HMAC-SHA1 of the 8-byte counter, dynamically truncated to 6 digits.
const codeForStep = (secret: string, step: number): string => {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
    const offset = digest[digest.length - 1]! & 0x0f;
    const binary = ((digest[offset]! & 0x7f) << 24) | (digest[offset + 1]! << 16) | (digest[offset + 2]! << 8) | digest[offset + 3]!;
    return String(binary % 10 ** DIGITS).padStart(DIGITS, "0");
};

export const totpCode = (secret: string, now = Date.now()) => codeForStep(secret, currentStep(now));

// Accepts the current step and one either side (±30s of clock drift). Returns the matching
// step so the caller can refuse a replay of the same code, or null when nothing matches.
export const verifyTotp = (secret: string, code: unknown, now = Date.now()): number | null => {
    if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) return null;
    const submitted = Buffer.from(code.trim());
    const step = currentStep(now);
    for (const candidate of [step - 1, step, step + 1]) {
        if (timingSafeEqual(Buffer.from(codeForStep(secret, candidate)), submitted)) return candidate;
    }
    return null;
};

// The otpauth:// URI authenticator apps import (usually from a QR code).
export const otpauthUri = (secret: string, accountName: string, issuer = "Afritask Admin") =>
    `otpauth://totp/${encodeURIComponent(`${issuer}:${accountName}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
