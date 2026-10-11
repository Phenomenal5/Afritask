import prisma from "../config/prisma.js";
import env from "../config/env.js";
import { hashPassword } from "../utils/password.js";
import { assertValidEmail, assertValidPassword } from "../utils/userValidation.js";
import { recordAdminAudit } from "./adminAuditService.js";
import logger, { errorMessage } from "../utils/logger.js";

// ─── First Platform Superadmin, from the environment ─────────────────────
// On boot, if SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD are set, make sure that person can
// sign in to the admin console — so a fresh environment needs no manual step.
//
// It only ever acts ONCE per email:
// - no account yet: creates a verified account with that password, plus operator access;
// - an account exists but has never had operator access: grants it (password untouched);
// - the account has, or ever had, operator access: does nothing. In particular a revoked
//   operator is NOT re-granted by a restart; that takes the grant script.
// The first console sign-in still requires setting up an authenticator (MFA).
// NOTE: once the account exists, the two variables can (and should) be removed.

const BOOTSTRAP_NOTE = "Bootstrap from SUPERADMIN_EMAIL";
const DEFAULT_NAME = "Platform Admin";

export type BootstrapOutcome = "created" | "granted" | "unchanged";

export const ensureBootstrapOperator = async ({ email, password, name = DEFAULT_NAME }: { email: string; password: string; name?: string }): Promise<BootstrapOutcome> => {
    const normalizedEmail = assertValidEmail(email.trim().toLowerCase());
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail }, include: { platformGrant: true } });
    if (existing?.platformGrant) return "unchanged";

    // Validate and hash outside the transaction (bcrypt is slow).
    const passwordHash = existing ? null : await hashPassword(assertValidPassword(password));

    return prisma.$transaction(async (transaction) => {
        const user = existing
            ? await transaction.user.update({ where: { id: existing.id }, data: { isVerified: true } })
            : await transaction.user.create({ data: { name, email: normalizedEmail, password: passwordHash!, isVerified: true } });
        await transaction.platformGrant.create({ data: { userId: user.id, note: BOOTSTRAP_NOTE } });
        await recordAdminAudit(transaction, {
            actorId: null,
            action: "operator.granted",
            targetType: "operator",
            targetId: user.id,
            reason: BOOTSTRAP_NOTE,
            metadata: { via: "environment bootstrap", accountCreated: !existing },
        });
        return existing ? "granted" : "created";
    });
};

// Called once from server.ts after the server starts listening. Never throws: a problem
// here is logged and must not stop the API from serving customers.
export const bootstrapOperatorFromEnv = async () => {
    if (!env.superadminEmail || !env.superadminPassword) return;
    if (env.isProduction && env.superadminPassword.length < 12) {
        logger.warn("SUPERADMIN_PASSWORD is shorter than 12 characters. MFA still protects the console, but use a long random password in production.");
    }
    try {
        const outcome = await ensureBootstrapOperator({ email: env.superadminEmail, password: env.superadminPassword, name: env.superadminName });
        if (outcome === "created") logger.info(`Admin console: created the bootstrap operator account (${env.superadminEmail}). Remove SUPERADMIN_PASSWORD from the environment now.`);
        if (outcome === "granted") logger.info(`Admin console: granted operator access to the existing account ${env.superadminEmail}.`);
    } catch (error) {
        // Two instances booting together can race on the unique grant; the other one won.
        if ((error as { code?: string })?.code === "P2002") return;
        logger.error(`Admin console bootstrap failed: ${errorMessage(error)}`);
    }
};
