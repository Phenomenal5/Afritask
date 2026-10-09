// ─── Prisma CLI config (migrate, generate, studio) ─────────────────────
// Prisma 7 no longer auto-loads .env, so load it here.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // NOTE: migrations need a direct connection — Neon's "-pooler" host (PgBouncer)
    // can't hold the advisory lock `migrate` takes. The app itself uses the pooled
    // DATABASE_URL (config/prisma.ts). Falls back to DATABASE_URL for local Postgres.
    url: process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
  },
});
