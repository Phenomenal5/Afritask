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
        expectBadRequest(() => assertValidPassword(value), "Use a password of at least 6 characters."));
});

describe("assertValidEmail", () => {
    it("accepts a normal address", () => expect(assertValidEmail("ada@example.com")).toBe("ada@example.com"));
    // A non-string here would become a Prisma filter operator — see the security suite.
    it.each([["not-an-email"], [""], [{ not: "" }], [["a@b.co"]]])("rejects %p", (value) =>
        expectBadRequest(() => assertValidEmail(value), "Enter a full email address, like name@example.com."));
});

describe("normalizeName", () => {
    it("trims", () => expect(normalizeName("  Ada Lovelace ")).toBe("Ada Lovelace"));
    it.each([["   "], [""], [null], [42]])("rejects %p", (value) => expectBadRequest(() => normalizeName(value), "Enter your name, so teammates know who you are."));
});

describe("parseAge", () => {
    it.each([[undefined], [null], [""]])("treats %p as not provided", (value) => expect(parseAge(value)).toBeUndefined());
    it("coerces multipart strings", () => expect(parseAge("31")).toBe(31));
    it.each([["-1"], ["2.5"], ["abc"], [-3]])("rejects %p", (value) => expectBadRequest(() => parseAge(value), "Enter your age as a whole number, or leave it empty."));
});

describe("parseTimezone", () => {
    it("returns the canonical IANA name", () => expect(parseTimezone("africa/lagos")).toBe("Africa/Lagos"));
    it("treats empty as not provided", () => expect(parseTimezone("")).toBeUndefined());
    it.each([["Mars/Base"], [123], [{}]])("rejects %p", (value) => expectBadRequest(() => parseTimezone(value), "Choose your time zone from the list."));
});

describe("normalizeWorkspaceName", () => {
    it("trims", () => expect(normalizeWorkspaceName("  Acme  ")).toBe("Acme"));
    it("rejects blank", () => expectBadRequest(() => normalizeWorkspaceName("  "), "Give the workspace a name."));
    it("enforces the 100-character limit", () => {
        expect(normalizeWorkspaceName("x".repeat(100))).toHaveLength(100);
        expectBadRequest(() => normalizeWorkspaceName("x".repeat(101)), "Keep the name to 100 characters or fewer.");
    });
    it("names what is being named in messages", () => expectBadRequest(() => normalizeWorkspaceName("", "project"), "Give the project a name."));
});
