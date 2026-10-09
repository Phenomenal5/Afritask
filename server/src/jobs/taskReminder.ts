import { Queue, Worker } from "bullmq"
import prisma from "../config/prisma.js"
import { sendTaskReminderEmail } from "../utils/email.js"
import logger from "../utils/logger.js"
import redisConnection from "../config/redis.js"

const QUEUE_NAME = "task-reminders"


// ─── Send reminder emails for tasks due tomorrow ─────────────────────
const sendDueTomorrowReminders = async () => {
    let emailsSent = 0;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10)

    const dueTasks = await prisma.task.findMany({
        where: {
            deadline: {
                gte: new Date(tomorrowStr),
                lt: new Date(`${tomorrowStr}T23:59:59`)
            },
            status: { not: "completed" }
        },
        include: { user: { select: { email: true } } },
    });

    for (const task of dueTasks) {
        if (task.user?.email) {
            await sendTaskReminderEmail(task.user.email, task);
            emailsSent += 1;
        }
    }

    logger.info(`Task reminder job completed. Emails sent: ${emailsSent}`);
}


// ─── Register the daily schedule + worker ─────────────────────
const startTaskReminderJob = () => {
    logger.info("Starting task reminder queue registration");

    const reminderQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

    // upsert (not add) so restarts/redeploys reuse the same schedule instead of stacking duplicates.
    // runs everyday at 8:00am server time
    reminderQueue
        .upsertJobScheduler("daily-task-reminder", { pattern: "0 8 * * *" }, { name: "send-due-tomorrow" })
        .catch((error) => logger.error(`Failed to schedule task reminders: ${error.stack || error.message}`));

    const reminderWorker = new Worker(QUEUE_NAME, sendDueTomorrowReminders, { connection: redisConnection });

    reminderWorker.on("failed", (job, error) => {
        logger.error(`Task reminder job ${job?.id} failed: ${error.stack || error.message}`);
    });
}



export default startTaskReminderJob
