import validator from "validator";
import AppError from "./AppError.js";

// ─── User field rules (formerly enforced by the Mongoose schema) ─────────────────────
// Same rules and messages the old schema produced, so clients see no difference.
// Each helper throws an operational 400 — inside catchAsync that reaches the error handler.

const PASSWORD_MIN_LENGTH = 6;
// NOTE: bcrypt only reads the first 72 bytes, so a longer password would silently match
// any password sharing its first 72 bytes. 128 characters is plenty for a passphrase.
const PASSWORD_MAX_LENGTH = 128;
const NAME_MAX_LENGTH = 80;
const EMAIL_MAX_LENGTH = 254;

export const assertValidPassword = (password: unknown): string => {
    if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
        throw new AppError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`, 400);
    }
    if (password.length > PASSWORD_MAX_LENGTH) throw new AppError(`Keep your password under ${PASSWORD_MAX_LENGTH} characters`, 400);
    return password;
};

export const assertValidEmail = (email: unknown): string => {
    if (typeof email !== "string" || email.length > EMAIL_MAX_LENGTH || !validator.isEmail(email)) {
        throw new AppError("Invalid email address", 400);
    }
    return email;
};

// Emails are stored and compared trimmed and lowercased, so "Ada@Example.com" and
// "ada@example.com" are one account. Anything that isn't a string becomes "" (fails checks).
export const normalizeEmail = (email: unknown): string => (typeof email === "string" ? email.trim().toLowerCase() : "");

// NOTE: a name shows up in member lists, push notifications and email subjects, so it's
// one line (inner whitespace collapsed) and short.
export const normalizeName = (name: unknown): string => {
    const trimmedName = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
    if (!trimmedName) throw new AppError("Name is required", 400);
    if (trimmedName.length > NAME_MAX_LENGTH) throw new AppError(`Keep the name under ${NAME_MAX_LENGTH} characters`, 400);
    return trimmedName;
};

// NOTE: age arrives as a string from multipart/form-data (profile form) — coerce it,
// the way Mongoose used to. Empty string means "not provided".
export const parseAge = (age: unknown): number | undefined => {
    if (age === undefined || age === null || age === "") return undefined;
    const parsedAge = Number(age);
    if (!Number.isInteger(parsedAge) || parsedAge < 0 || parsedAge > 150) {
        throw new AppError("Age must be a positive number", 400);
    }
    return parsedAge;
};

// IANA zone names only ("Africa/Lagos", "UTC"). Intl rejects unknown zones by throwing,
// which is more reliable than a hand-kept list. Empty/undefined = not provided.
export const parseTimezone = (timezone: unknown): string | undefined => {
    if (timezone === undefined || timezone === null || timezone === "") return undefined;
    if (typeof timezone !== "string") throw new AppError("Please provide a valid timezone", 400);
    try {
        // resolvedOptions() gives the canonical spelling ("africa/lagos" → "Africa/Lagos").
        return new Intl.DateTimeFormat("en-US", { timeZone: timezone }).resolvedOptions().timeZone;
    } catch {
        throw new AppError("Please provide a valid timezone", 400);
    }
};
