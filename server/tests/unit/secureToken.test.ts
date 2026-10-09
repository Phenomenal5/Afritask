// Unit: random tokens and their stored hashes.
import { describe, expect, it } from "@jest/globals";
import { createHash } from "node:crypto";
import { generateSecureToken, hashSecureToken } from "../../src/utils/secureToken.js";
import { comparePassword, hashPassword } from "../../src/utils/password.js";

describe("generateSecureToken", () => {
    it("is 256 bits of hex", () => expect(generateSecureToken()).toMatch(/^[0-9a-f]{64}$/));
    it("doesn't repeat", () => {
        const tokens = new Set(Array.from({ length: 500 }, generateSecureToken));
        expect(tokens.size).toBe(500);
    });
});

describe("hashSecureToken", () => {
    it("is deterministic SHA-256 hex", () => {
        expect(hashSecureToken("abc")).toBe(hashSecureToken("abc"));
        expect(hashSecureToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    });

    // NOTE: the auth_sessions migration hashed legacy tokens in SQL with
    // encode(sha256(convert_to(token, 'UTF8')), 'hex'). This pins the Node side to the same
    // function — if it ever changed, every carried-over email link would silently break.
    it("matches Postgres encode(sha256(convert_to(x,'UTF8')),'hex')", () => {
        const knownSqlResult = createHash("sha256").update("legacy-token", "utf8").digest("hex");
        expect(hashSecureToken("legacy-token")).toBe(knownSqlResult);
    });

    it("never returns the raw token", () => expect(hashSecureToken("raw-token")).not.toContain("raw-token"));
});

describe("password hashing", () => {
    it("verifies the right password and rejects others", async () => {
        const hash = await hashPassword("s3cret-pass");
        expect(hash).not.toContain("s3cret-pass");
        await expect(comparePassword("s3cret-pass", hash)).resolves.toBe(true);
        await expect(comparePassword("wrong-pass", hash)).resolves.toBe(false);
    });

    it("returns false (not an error) when there is no hash — Google-only accounts", async () => {
        await expect(comparePassword("anything", null)).resolves.toBe(false);
    });
});
