import validator from "validator";
import AppError from "./AppError.js";

// ─── User field rules (formerly enforced by the Mongoose schema) ─────────────────────
// Same rules and messages the old schema produced, so clients see no difference.
// Each helper throws an operational 400 — inside catchAsync that reaches the error handler.

const PASSWORD_MIN_LENGTH = 6;

export const assertValidPassword = (password: unknown): string => {
    if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
        throw new AppError(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`, 400);
    }
    return password;
};

export const assertValidEmail = (email: unknown): string => {
    if (typeof email !== "string" || !validator.isEmail(email)) {
        throw new AppError("Invalid email address", 400);
    }
    return email;
};

export const normalizeName = (name: unknown): string => {
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) throw new AppError("Name is required", 400);
    return trimmedName;
};

// NOTE: age arrives as a string from multipart/form-data (profile form) — coerce it,
// the way Mongoose used to. Empty string means "not provided".
export const parseAge = (age: unknown): number | undefined => {
    if (age === undefined || age === null || age === "") return undefined;
    const parsedAge = Number(age);
    if (!Number.isInteger(parsedAge) || parsedAge < 0) {
        throw new AppError("Age must be a positive number", 400);
    }
    return parsedAge;
};
