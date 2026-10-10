// ─── Shared Prisma client (PostgreSQL via the pg driver adapter) ─────────────────────
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma, type User } from "../generated/prisma/client.js";
import logger, { describeError } from "../utils/logger.js";
import env from "./env.js";

// NOTE: Neon suspends idle compute (scale-to-zero) and its pooler drops idle client
// connections. A pooled connection kept past that fails on next use with "Server has
// closed the connection" — that surfaced as random 401s. Releasing idle connections
// quickly means the pool reconnects instead of reusing a dead socket.
const adapter = new PrismaPg({
  connectionString: env.databaseUrl,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 15_000,
});

// Columns that must never leave the server. Drives both the global omit below
// and the PublicUser type, so the two can't drift apart.
// NOTE: `satisfies Prisma.UserOmit` makes a stale entry (a dropped column) a compile
// error — without it, a leftover name only blew up when the server started.
// (Tokens and sessions live in their own tables now, never on the user row.)
const USER_SECRET_FIELDS = {
  password: true,
  legacyMongoId: true,
} as const satisfies Prisma.UserOmit;

// What a default user query returns (and what `protect` puts on req.user).
export type PublicUser = Omit<User, keyof typeof USER_SECRET_FIELDS>;

// NOTE: secrets are omitted from EVERY query result by default — the replacement for
// Mongoose's `select: false`. A response can therefore never leak them by accident;
// code that genuinely needs one opts back in per query, e.g.
// `prisma.user.findUnique({ where, omit: { password: false } })`.
const prisma = new PrismaClient({
  adapter,
  // NOTE: a task update runs several statements in one interactive transaction (version
  // check, before/after snapshot, activity entry, notification). Against a remote Neon
  // database each round trip can take a few hundred ms, and Prisma's 5s default timeout
  // occasionally expired mid-update (seen as a random failed save). The work is still
  // short; this only stops a slow network from aborting it.
  transactionOptions: { maxWait: 10_000, timeout: 15_000 },
  omit: {
    user: USER_SECRET_FIELDS,
    task: {
      legacyMongoId: true,
    },
  },
});

// Fail fast at boot: an unreachable database should stop the server, not 500 every request.
export const connectDatabase = async () => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    logger.info("PostgreSQL connected successfully");
  } catch (error) {
    logger.error(describeError(error));
    process.exit(1);
  }
};

export default prisma;
