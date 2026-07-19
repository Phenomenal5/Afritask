import cron from "node-cron"
import Task from "../models/Task.js"
import { sendTaskReminderEmail } from "../utils/email.js"
import catchAsync from "../utils/catchAsync.js"
import logger from "../utils/logger.js"


const startTaskReminderJob = () => {
    logger.info("Starting task reminder cron job registration");
    // runs everyday at 8:00am server time
    cron.schedule("0 8 * * *", catchAsync(async () => {
        logger.info("runs everyday at 8:00am server time");
        let emailsSent = 0;
        try {
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().slice(0, 10)

            const dueTasks = await Task.find({
                deadline: {
                    $gte: new Date(tomorrowStr),
                    $lt: new Date(`${tomorrowStr}T23:59:59`)
                },
                status: {$ne: "completed"}
            }).populate("user");

            for (const task of dueTasks) {
                if (task.user?.email) {
                    await sendTaskReminderEmail(task.user.email, task);
                    emailsSent += 1;
                }
            }

            logger.info(`Task reminder job completed. Emails sent: ${emailsSent}`);
        } catch (error) {
            logger.error(error.stack || error.message || error);
            throw error;
        }
    }))
}



export default startTaskReminderJob