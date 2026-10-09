// Integration: single-use account tokens against the real database.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { consumeAccountToken, findAccountToken, issueAccountToken, revokeAccountTokens } from "../../src/services/accountTokenService.js";
import { hashSecureToken } from "../../src/utils/secureToken.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createUser } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

const TEN_MINUTES = 10 * 60 * 1000;

describe("accountTokenService", () => {
    it("stores only the hash of the token", async () => {
        const user = await createUser();
        const rawToken = await issueAccountToken(user.id, "reset_password", TEN_MINUTES);
        const rows = await prisma.accountToken.findMany();
        expect(rows).toHaveLength(1);
        expect(rows[0]!.tokenHash).toBe(hashSecureToken(rawToken));
        expect(JSON.stringify(rows)).not.toContain(rawToken);
    });

    it("issuing again retires the previous unused token of the same purpose", async () => {
        const user = await createUser();
        const firstToken = await issueAccountToken(user.id, "reset_password", TEN_MINUTES);
        const secondToken = await issueAccountToken(user.id, "reset_password", TEN_MINUTES);
        await expect(consumeAccountToken(firstToken, "reset_password")).resolves.toBeNull();
        await expect(consumeAccountToken(secondToken, "reset_password")).resolves.toBe(user.id);
    });

    it("keeps purposes separate", async () => {
        const user = await createUser();
        const verifyToken = await issueAccountToken(user.id, "verify_email", TEN_MINUTES);
        await issueAccountToken(user.id, "reset_password", TEN_MINUTES);
        await expect(consumeAccountToken(verifyToken, "reset_password")).resolves.toBeNull();
        await expect(consumeAccountToken(verifyToken, "verify_email")).resolves.toBe(user.id);
    });

    it("is single-use", async () => {
        const user = await createUser();
        const rawToken = await issueAccountToken(user.id, "oauth_exchange", TEN_MINUTES);
        await expect(consumeAccountToken(rawToken, "oauth_exchange")).resolves.toBe(user.id);
        await expect(consumeAccountToken(rawToken, "oauth_exchange")).resolves.toBeNull();
    });

    it("lets exactly one of many concurrent consumers win", async () => {
        const user = await createUser();
        const rawToken = await issueAccountToken(user.id, "reset_password", TEN_MINUTES);
        const results = await Promise.all(Array.from({ length: 8 }, () => consumeAccountToken(rawToken, "reset_password")));
        expect(results.filter(Boolean)).toHaveLength(1);
    });

    it("rejects an expired token", async () => {
        const user = await createUser();
        const rawToken = await issueAccountToken(user.id, "reset_password", -1000);
        await expect(consumeAccountToken(rawToken, "reset_password")).resolves.toBeNull();
    });

    it("findAccountToken looks up without consuming, and includes the user without secrets", async () => {
        const user = await createUser();
        const rawToken = await issueAccountToken(user.id, "verify_email", TEN_MINUTES);
        const found = await findAccountToken(rawToken, "verify_email");
        expect(found?.usedAt).toBeNull();
        expect(found?.user.email).toBe(user.email);
        expect(found?.user).not.toHaveProperty("password");
        await expect(consumeAccountToken(rawToken, "verify_email")).resolves.toBe(user.id);
    });

    it("revokeAccountTokens kills outstanding links", async () => {
        const user = await createUser();
        const rawToken = await issueAccountToken(user.id, "reset_password", TEN_MINUTES);
        await revokeAccountTokens(user.id, "reset_password");
        await expect(consumeAccountToken(rawToken, "reset_password")).resolves.toBeNull();
    });
});
