// ─── Grant, revoke or reset Platform Superadmin access (SRS SR16 "controlled bootstrap") ─────────────
//
//   npm run operator:grant -- --email you@example.com --note "Initial operator"
//   npm run operator:grant -- --email you@example.com --reset-mfa --note "Lost phone"
//   npm run operator:grant -- --email you@example.com --revoke --note "Left the team"
//   (production: node dist/scripts/grantOperator.js …)
//
// NOTE: this script is the ONLY way operator access is created — there is deliberately no
// API route for it, so a compromised account or bug in the app can't mint an operator.
// Run it where DATABASE_URL points at the target environment. The account must already
// exist and be verified. Every change is written to the operator audit trail.

import "dotenv/config";
import prisma from "../config/prisma.js";
import { recordAdminAudit } from "../services/adminAuditService.js";

const argumentValue = (name: string) => {
    const index = process.argv.indexOf(`--${name}`);
    return index === -1 ? undefined : process.argv[index + 1];
};
const hasFlag = (name: string) => process.argv.includes(`--${name}`);

const main = async () => {
    const email = argumentValue("email")?.trim().toLowerCase();
    const note = argumentValue("note")?.trim() ?? "";
    if (!email) throw new Error("Usage: npm run operator:grant -- --email <address> [--revoke | --reset-mfa] [--note <why>]");

    const user = await prisma.user.findUnique({ where: { email }, include: { platformGrant: true } });
    if (!user) throw new Error(`No account with email ${email}. Sign up in the app first.`);
    if (!user.isVerified) throw new Error(`${email} hasn't verified their email yet.`);

    if (hasFlag("revoke")) {
        if (!user.platformGrant || user.platformGrant.revokedAt) throw new Error(`${email} has no active operator access.`);
        await prisma.$transaction(async (transaction) => {
            await transaction.platformGrant.update({ where: { userId: user.id }, data: { revokedAt: new Date(), note } });
            // Signed-in console sessions end now, not at their expiry.
            await transaction.session.updateMany({ where: { userId: user.id, kind: "operator", revokedAt: null }, data: { revokedAt: new Date() } });
            await recordAdminAudit(transaction, { actorId: null, action: "operator.revoked", targetType: "operator", targetId: user.id, reason: note, metadata: { via: "grant script" } });
        });
        console.log(`Operator access revoked for ${email}.`);
        return;
    }

    if (hasFlag("reset-mfa")) {
        if (!user.platformGrant || user.platformGrant.revokedAt) throw new Error(`${email} has no active operator access.`);
        await prisma.$transaction(async (transaction) => {
            await transaction.platformGrant.update({ where: { userId: user.id }, data: { mfaSecretEncrypted: null, mfaEnabledAt: null, mfaLastUsedStep: null } });
            await transaction.session.updateMany({ where: { userId: user.id, kind: "operator", revokedAt: null }, data: { revokedAt: new Date() } });
            await recordAdminAudit(transaction, { actorId: null, action: "operator.granted", targetType: "operator", targetId: user.id, reason: note || "MFA reset", metadata: { via: "grant script", mfaReset: true } });
        });
        console.log(`MFA reset for ${email}. They'll set up a new authenticator at their next console sign-in.`);
        return;
    }

    await prisma.$transaction(async (transaction) => {
        // Re-granting a revoked operator starts them over with fresh MFA.
        await transaction.platformGrant.upsert({
            where: { userId: user.id },
            create: { userId: user.id, note },
            update: { revokedAt: null, note, mfaSecretEncrypted: null, mfaEnabledAt: null, mfaLastUsedStep: null, grantedAt: new Date() },
        });
        await recordAdminAudit(transaction, { actorId: null, action: "operator.granted", targetType: "operator", targetId: user.id, reason: note, metadata: { via: "grant script" } });
    });
    console.log(`${email} can now sign in to the admin console. They'll set up two-step verification on first sign-in.`);
};

main()
    .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
