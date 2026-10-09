// Unit: user field rules carried over from the old Mongoose schema.
import { describe, expect, it } from "@jest/globals";
import { assertValidEmail, assertValidPassword, normalizeName, parseAge, parseTimezone } from "../../src/utils/userValidation.js";
import { normalizeWorkspaceName } from "../../src/utils/workspaceValidation.js";
import AppError from "../../src/utils/AppError.js";

const expectBadRequest = (run: () => unknown, message: string) => {
    try {
        run();
        throw new Error("expected a 400 AppError");
    } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).statusCode).toBe(400);
        expect((error as AppError).message).toBe(message);
    }
};

describe("assertValidPassword", () => {
    it("accepts 6+ characters", () => expect(assertValidPassword("123456")).toBe("123456"));
    it.each([["12345"], [""], [undefined], [123456]])("rejects %p", (value) =>
        expectBadRequest(() => assertValidPassword(value), "Password must be at least 6 characters"));
});

describe("assertValidEmail", () => {
    it("accepts a normal address", () => expect(assertValidEmail("ada@example.com")).toBe("ada@example.com"));
    // A non-string here would become a Prisma filter operator — see the security suite.
    it.each([["not-an-email"], [""], [{ not: "" }], [["a@b.co"]]])("rejects %p", (value) =>
        expectBadRequest(() => assertValidEmail(value), "Invalid email address"));
});

describe("normalizeName", () => {
    it("trims", () => expect(normalizeName("  Ada Lovelace ")).toBe("Ada Lovelace"));
    it.each([["   "], [""], [null], [42]])("rejects %p", (value) => expectBadRequest(() => normalizeName(value), "Name is required"));
});

describe("parseAge", () => {
    it.each([[undefined], [null], [""]])("treats %p as not provided", (value) => expect(parseAge(value)).toBeUndefined());
    it("coerces multipart strings", () => expect(parseAge("31")).toBe(31));
    it.each([["-1"], ["2.5"], ["abc"], [-3]])("rejects %p", (value) => expectBadRequest(() => parseAge(value), "Age must be a positive number"));
});

describe("parseTimezone", () => {
    it("returns the canonical IANA name", () => expect(parseTimezone("africa/lagos")).toBe("Africa/Lagos"));
    it("treats empty as not provided", () => expect(parseTimezone("")).toBeUndefined());
    it.each([["Mars/Base"], [123], [{}]])("rejects %p", (value) => expectBadRequest(() => parseTimezone(value), "Please provide a valid timezone"));
});

describe("normalizeWorkspaceName", () => {
    it("trims", () => expect(normalizeWorkspaceName("  Acme  ")).toBe("Acme"));
    it("rejects blank", () => expectBadRequest(() => normalizeWorkspaceName("  "), "Workspace name is required"));
    it("enforces the 100-character limit", () => {
        expect(normalizeWorkspaceName("x".repeat(100))).toHaveLength(100);
        expectBadRequest(() => normalizeWorkspaceName("x".repeat(101)), "Workspace name must be 100 characters or fewer");
    });
    it("uses the given label in messages", () => expectBadRequest(() => normalizeWorkspaceName("", "Project name"), "Project name is required"));
});
