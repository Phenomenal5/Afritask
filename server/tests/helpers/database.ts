// ─── Test database helpers ─────────────────────
import prisma from "../../src/config/prisma.js";

let tableNames: string[] | null = null;

// Empty every application table (not the migrations ledger) — call in beforeEach so each
// test starts from nothing and tests can't depend on each other's leftovers.
export const resetDatabase = async () => {
    if (!tableNames) {
        const rows = await prisma.$queryRaw<{ tablename: string }[]>`
            SELECT tablename FROM pg_tables
            WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
        tableNames = rows.map((row) => row.tablename);
    }
    if (tableNames.length === 0) return;
    const quotedTables = tableNames.map((name) => `"${name}"`).join(", ");
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`);
};

export const disconnectDatabase = () => prisma.$disconnect();

export { prisma };
