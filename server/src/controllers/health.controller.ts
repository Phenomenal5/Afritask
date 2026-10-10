import { Redis } from "ioredis";
import prisma from "../config/prisma.js";
import env from "../config/env.js";
import catchAsync from "../utils/catchAsync.js";
import logger, { errorMessage } from "../utils/logger.js";

// ─── Health checks (Technical Design: "readiness verifies required dependencies;
// liveness indicates process health") ─────────────────────
// - GET /api/health        liveness: the process is up and answering. Never touches a
//                          dependency, so a slow database can't get the process restarted.
// - GET /api/health/ready  readiness: PostgreSQL and Redis both answer. 503 otherwise, so
//                          a load balancer stops sending traffic until they're back.
// Neither returns secrets, hostnames or error details — only "ok"/"unavailable".

const CHECK_TIMEOUT_MS = 3_000;
const startedAt = new Date();
// Set by the deploy (e.g. the git SHA) so "which build is live?" has an answer.
const releaseVersion = process.env.RELEASE_VERSION || "dev";

// One small client just for pings, created on first use (tests and liveness never need it).
let redisClient: Redis | null = null;
const pingRedis = async () => {
    // NOTE: retryStrategy null = no background reconnect loop; each readiness check simply
    // tries again. (A retrying client kept the process — and test runs — from exiting.)
    redisClient ??= new Redis(env.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false, retryStrategy: () => null });
    if (redisClient.status === "wait" || redisClient.status === "end") await redisClient.connect();
    return redisClient.ping();
};

const withTimeout = <Result>(work: Promise<Result>) =>
    Promise.race([work, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS))]);

const check = async (name: string, probe: () => Promise<unknown>) => {
    const started = Date.now();
    try {
        await withTimeout(probe());
        return { name, status: "ok" as const, latencyMs: Date.now() - started };
    } catch (error) {
        // Details go to the log (with the request id), not to whoever asked.
        logger.error(`Readiness check failed: ${name}: ${errorMessage(error)}`);
        return { name, status: "unavailable" as const, latencyMs: Date.now() - started };
    }
};

export const liveness = (req: import("express").Request, res: import("express").Response) => {
    res.status(200).json({ status: "ok", version: releaseVersion, uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000) });
};

export const readiness = catchAsync(async (req, res) => {
    const checks = await Promise.all([check("database", () => prisma.$queryRaw`SELECT 1`), check("redis", pingRedis)]);
    const ready = checks.every((result) => result.status === "ok");
    res.status(ready ? 200 : 503).json({
        status: ready ? "ok" : "unavailable",
        version: releaseVersion,
        checks: Object.fromEntries(checks.map(({ name, status, latencyMs }) => [name, { status, latencyMs }])),
    });
});

// For graceful shutdown.
export const closeHealthConnections = async () => {
    if (redisClient && redisClient.status !== "end") await redisClient.quit().catch(() => undefined);
};
