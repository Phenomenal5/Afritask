// ─── Boot: load env → connect DB → listen → start background jobs ─────────────────────
// "dotenv/config" must stay the FIRST import: config/env.ts validates process.env the
// moment it's imported (via app.ts), and ESM evaluates imports in order.
import "dotenv/config";
import app from "./app.js";
import logger from "./utils/logger.js";
import { connectDatabase } from "./config/prisma.js";
import startTaskReminderJob from "./jobs/taskReminder.js";
import env from "./config/env.js";


connectDatabase();


app.listen(env.port, () => {
  logger.info(`Server is running on port ${env.port}`);
  if (env.apiDocsEnabled) logger.info(`API docs at http://localhost:${env.port}/api/docs`);
  startTaskReminderJob();
});
