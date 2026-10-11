// Integration: the first admin console account, created on boot from the environment.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { ensureBootstrapOperator } from "../../src/services/bootstrapOperatorService.js";
import { comparePassword } from "../../src/utils/password.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createUser, DEFAULT_PASSWORD, uniqueEmail } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

const STRONG_PASSWORD = "a-long-bootstrap-password";

describe("ensureBootstrapOperator", () => {
    it("creates a verified account with operator access, audited", async () => {
        const email = uniqueEmail("operator");
        await expect(ensureBootstrapOperator({ email: email.toUpperCase(), password: STRONG_PASSWORD, name: "Ada Operator" })).resolves.toBe("created");

        const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { platformGrant: true }, omit: { password: false } });
        expect(user).toMatchObject({ name: "Ada Operator", isVerified: true });
        expect(await comparePassword(STRONG_PASSWORD, user.password)).toBe(true);
        // MFA is set up at the first console sign-in.
        expect(user.platformGrant).toMatchObject({ revokedAt: null, mfaEnabledAt: null });
        await expect(prisma.adminAuditEntry.count({ where: { action: "operator.granted", targetId: user.id } })).resolves.toBe(1);
    });

    it("grants an existing account without touching its password", async () => {
        const existing = await createUser({ verified: false });
        await expect(ensureBootstrapOperator({ email: existing.email, password: STRONG_PASSWORD })).resolves.toBe("granted");

        const user = await prisma.user.findUniqueOrThrow({ where: { id: existing.id }, include: { platformGrant: true }, omit: { password: false } });
        expect(user.platformGrant).not.toBeNull();
        expect(user.isVerified).toBe(true);
        expect(await comparePassword(DEFAULT_PASSWORD, user.password)).toBe(true);
    });

    it("runs once: later boots change nothing", async () => {
        const email = uniqueEmail("operator");
        await ensureBootstrapOperator({ email, password: STRONG_PASSWORD });
        await expect(ensureBootstrapOperator({ email, password: "a-different-password-now" })).resolves.toBe("unchanged");

        const user = await prisma.user.findUniqueOrThrow({ where: { email }, omit: { password: false } });
        expect(await comparePassword(STRONG_PASSWORD, user.password)).toBe(true);
        await expect(prisma.adminAuditEntry.count()).resolves.toBe(1);
    });

    it("never re-grants a revoked operator", async () => {
        const email = uniqueEmail("operator");
        await ensureBootstrapOperator({ email, password: STRONG_PASSWORD });
        const user = await prisma.user.findUniqueOrThrow({ where: { email } });
        await prisma.platformGrant.update({ where: { userId: user.id }, data: { revokedAt: new Date() } });

        await expect(ensureBootstrapOperator({ email, password: STRONG_PASSWORD })).resolves.toBe("unchanged");
        await expect(prisma.platformGrant.findUniqueOrThrow({ where: { userId: user.id } })).resolves.toMatchObject({ revokedAt: expect.any(Date) });
    });

    it("refuses a malformed email or a too-short password", async () => {
        await expect(ensureBootstrapOperator({ email: "not-an-email", password: STRONG_PASSWORD })).rejects.toThrow();
        await expect(ensureBootstrapOperator({ email: uniqueEmail(), password: "12345" })).rejects.toThrow();
        await expect(prisma.platformGrant.count()).resolves.toBe(0);
    });
});
