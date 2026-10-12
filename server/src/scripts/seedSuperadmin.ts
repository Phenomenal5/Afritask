// ─── Seed the Platform Superadmin by hand ─────────────────────
//
//   npm run seed:superadmin
//   (production: node dist/scripts/seedSuperadmin.js)
//
// Reads SUPERADMIN_EMAIL, SUPERADMIN_PASSWORD and SUPERADMIN_NAME from the environment and
// runs the same step the server runs on boot (services/bootstrapOperatorService.ts), for
// when you want it done now, without starting the server. Safe to run again:
// - no account yet: creates a verified account with that password, plus operator access;
// - an account without operator access: grants it (its password is left alone);
// - an operator already (or a revoked one): changes nothing. Use operator:grant for that.
// Run it where DATABASE_URL points at the database you mean to seed.

import prisma from "../config/prisma.js";
import env from "../config/env.js";
import { ensureBootstrapOperator } from "../services/bootstrapOperatorService.js";

const OUTCOME_MESSAGES = {
    created: "Created the superadmin account. Sign in to the admin console and set up two-step verification.",
    granted: "That account already existed; it now has admin console access. Its password wasn't changed.",
    unchanged: "That account already has (or had) admin console access, so nothing was changed. To restore revoked access, use npm run operator:grant.",
} as const;

const main = async () => {
    if (!env.superadminEmail || !env.superadminPassword) {
        throw new Error("Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD in .env first (SUPERADMIN_NAME is optional).");
    }
    const outcome = await ensureBootstrapOperator({ email: env.superadminEmail, password: env.superadminPassword, name: env.superadminName });
    console.log(`${env.superadminEmail}: ${OUTCOME_MESSAGES[outcome]}`);
};

main()
    .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
