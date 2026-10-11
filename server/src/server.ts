// ─── Boot: load env → connect DB → listen → start background jobs ─────────────────────
// "dotenv/config" must stay the FIRST import: config/env.ts validates process.env the
// moment it's imported (via app.ts), and ESM evaluates imports in order.
import "dotenv/config";
import app from "./app.js";
import logger, { describeError } from "./utils/logger.js";
import prisma, { connectDatabase } from "./config/prisma.js";
import startTaskReminderJob from "./jobs/taskReminder.js";
import { bootstrapOperatorFromEnv } from "./services/bootstrapOperatorService.js";
import { closeHealthConnections } from "./controllers/health.controller.js";
import env from "./config/env.js";

// How long in-flight requests and a running reminder sweep get to finish on shutdown
// before the process exits anyway (hosts usually send SIGKILL ~30s after SIGTERM).
const SHUTDOWN_GRACE_MS = 20_000;

// NOTE: the database is connected BEFORE listening — previously the server accepted
// requests while the connection was still being made, and early ones could fail.
await connectDatabase();

const server = app.listen(env.port, () => {
  logger.info(`Server is running on port ${env.port}`);
  if (env.apiDocsEnabled) logger.info(`API docs at http://localhost:${env.port}/api/docs`);
});
const reminderJob = startTaskReminderJob();
// First admin console account from SUPERADMIN_EMAIL/PASSWORD, if set. Fire and forget: it
// acts once per email, logs what it did, and never holds up or crashes the server.
void bootstrapOperatorFromEnv();

// ─── Graceful shutdown (deploys, restarts, scaling down) ─────────────────────
// Stop taking new connections, let in-flight requests and a running sweep finish, then
// close the database and Redis cleanly so nothing is cut off half-written.
let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info(`${signal} received — shutting down gracefully`);
  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out — exiting");
    process.exit(1);
  }, SHUTDOWN_GRACE_MS);
  forceExit.unref();

  try {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await reminderJob.close();
    await closeHealthConnections();
    await prisma.$disconnect();
    logger.info("Shutdown complete");
    process.exit(process.exitCode ?? 0);
  } catch (error) {
    logger.error(`Shutdown failed: ${describeError(error)}`);
    process.exit(1);
  }
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// ─── Last-resort error handlers ─────────────────────
// NOTE: Node 22 exits on an unhandled promise rejection, so one stray background promise
// (an email, a push, a sweep) took the whole API down with almost nothing in the logs.
// Log it and keep serving: a rejected promise doesn't corrupt the process.
process.on("unhandledRejection", (reason) => {
  logger.error(`Unhandled promise rejection: ${describeError(reason)}`);
});
// A synchronous throw nobody caught can leave the process in an unknown state, so this
// still exits — but says why, and shuts down cleanly first.
process.on("uncaughtException", (error) => {
  logger.error(`Uncaught exception: ${describeError(error)}`);
  process.exitCode = 1;
  void shutdown("uncaughtException");
});
