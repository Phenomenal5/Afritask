import { Queue, Worker } from "bullmq"
import prisma from "../config/prisma.js"
import { sendTaskReminderEmail, type TaskEmailKind } from "../utils/email.js"
import logger, { errorMessage } from "../utils/logger.js"
import redisConnection from "../config/redis.js"
import { notifyTaskSchedule } from "../services/notificationService.js"

// ─── Per-task reminders and overdue alerts (SRS SR10) ─────────────────────
// Every minute a sweep looks for tasks whose remindAt / overdueCheckAt has arrived. For each:
//   1. CLAIM it — a conditional update clears the field only if it still holds the value we
//      read, so two overlapping sweeps can never both deliver the same schedule;
//   2. RE-CHECK the task right now (still open, not archived, recipient still a member);
//   3. write the in-app notification and the email ledger row in one transaction (both
//      keyed by the schedule, so a repeat is a no-op), then send the email and record the
//      outcome. Failed emails are retried a bounded number of times, then left visible.
// Schedules are only ever set to FUTURE times (utils/reminderSchedule.ts); one that comes due
// more than MISSED_GRACE_MS late (e.g. the worker was down) is dropped, not sent in a burst.

const QUEUE_NAME = "task-reminders"
const SWEEP_EVERY_MS = 60_000
const BATCH_SIZE = 200
const MISSED_GRACE_MS = 2 * 60 * 60 * 1000
export const MAX_EMAIL_ATTEMPTS = 3
const RETRY_AFTER_MS = 5 * 60 * 1000

type ScheduleField = "remindAt" | "overdueCheckAt"

const KIND_OF: Record<ScheduleField, { notification: "task_reminder" | "task_overdue"; email: TaskEmailKind }> = {
    remindAt: { notification: "task_reminder", email: "reminder" },
    overdueCheckAt: { notification: "task_overdue", email: "overdue" },
}

// Everything the re-check and the email need, read fresh at delivery time.
const loadDeliverableTask = (taskId: string) =>
    prisma.task.findUnique({
        where: { id: taskId },
        select: {
            id: true,
            workspaceId: true,
            title: true,
            description: true,
            dueAt: true,
            status: true,
            creatorId: true,
            project: { select: { state: true } },
            assignee: { select: { status: true, userId: true } },
        },
    })

type DeliverableTask = NonNullable<Awaited<ReturnType<typeof loadDeliverableTask>>>

// NOTE: recipient rule (PRD FR10, SRS SR10): the current assignee; if unassigned, the
// creator — but ONLY while they're an active member, so a removed member never receives
// the task's content. Subtasks follow the same rule (no inheriting the parent's assignee).
const resolveRecipientId = async (task: DeliverableTask): Promise<string | null> => {
    if (task.assignee) return task.assignee.status === "active" ? task.assignee.userId : null
    const creatorMembership = await prisma.membership.findFirst({
        where: { workspaceId: task.workspaceId, userId: task.creatorId, status: "active" },
        select: { id: true },
    })
    return creatorMembership ? task.creatorId : null
}

// Why a claimed schedule should NOT be delivered now, or null if it should.
const suppressionReason = (task: DeliverableTask | null, field: ScheduleField, dueInstant: Date, now: Date): string | null => {
    if (!task) return "task deleted"
    if (task.status === "completed") return "task completed"
    if (task.project?.state === "archived") return "project archived"
    if (now.getTime() - dueInstant.getTime() > MISSED_GRACE_MS) return "missed while the worker was down"
    // The overdue alert belongs to the deadline it was armed for.
    if (field === "overdueCheckAt" && task.dueAt?.getTime() !== dueInstant.getTime()) return "deadline changed"
    return null
}

// Send one ledger row's email and record the outcome. Never throws.
const attemptEmail = async (deliveryId: string, recipientEmail: string, task: DeliverableTask, kind: TaskEmailKind) => {
    try {
        await sendTaskReminderEmail(recipientEmail, task, kind)
        await prisma.emailDelivery.update({
            where: { id: deliveryId },
            data: { status: "sent", sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
        })
        return true
    } catch (error) {
        await prisma.emailDelivery.update({
            where: { id: deliveryId },
            data: { status: "failed", attempts: { increment: 1 }, lastError: errorMessage(error).slice(0, 500) },
        })
        logger.error(`Reminder email failed deliveryId=${deliveryId}: ${errorMessage(error)}`)
        return false
    }
}

// ─── One schedule field: claim → re-check → deliver ─────────────────────
const processDueSchedules = async (field: ScheduleField, now: Date) => {
    const due = await prisma.task.findMany({
        where: field === "remindAt" ? { remindAt: { lte: now } } : { overdueCheckAt: { lte: now } },
        select: { id: true, remindAt: true, overdueCheckAt: true },
        orderBy: field === "remindAt" ? { remindAt: "asc" } : { overdueCheckAt: "asc" },
        take: BATCH_SIZE,
    })

    let delivered = 0
    for (const row of due) {
        const dueInstant = row[field]
        if (!dueInstant) continue

        // Claim: only the sweep that clears the exact value it read gets to deliver it.
        const { count } = await prisma.task.updateMany({
            where: { id: row.id, [field]: dueInstant },
            data: { [field]: null },
        })
        if (count === 0) continue

        const task = await loadDeliverableTask(row.id)
        const reason = suppressionReason(task, field, dueInstant, now)
        const recipientId = task && !reason ? await resolveRecipientId(task) : null
        if (!task || reason || !recipientId) {
            logger.info(`Reminder suppressed taskId=${row.id} kind=${field} reason=${reason ?? "no eligible recipient"}`)
            continue
        }

        const kind = KIND_OF[field]
        const scheduleKey = dueInstant.toISOString()
        const delivery = await prisma.$transaction(async (tx) => {
            await notifyTaskSchedule(tx, kind.notification, task, recipientId, scheduleKey)
            await tx.emailDelivery.createMany({
                data: [{ deliveryKey: `${kind.notification}:${task.id}:${scheduleKey}:${recipientId}`, kind: kind.notification, recipientId, taskId: task.id }],
                skipDuplicates: true,
            })
            return tx.emailDelivery.findUniqueOrThrow({
                where: { deliveryKey: `${kind.notification}:${task.id}:${scheduleKey}:${recipientId}` },
                include: { recipient: { select: { email: true } } },
            })
        })
        // NOTE: a known-successful email is never resent (SRS SR10).
        if (delivery.status !== "pending") continue
        if (await attemptEmail(delivery.id, delivery.recipient.email, task, kind.email)) delivered += 1
    }
    return delivered
}

// ─── Bounded retry of failed emails ─────────────────────
// Re-checks the work first: a reminder for a task finished (or deleted, archived, or handed
// to someone else) since the failure is suppressed instead of retried.
const retryFailedEmails = async (now: Date) => {
    const failed = await prisma.emailDelivery.findMany({
        where: { status: "failed", attempts: { lt: MAX_EMAIL_ATTEMPTS }, updatedAt: { lte: new Date(now.getTime() - RETRY_AFTER_MS) } },
        include: { recipient: { select: { email: true } } },
        take: BATCH_SIZE,
    })
    let retried = 0
    for (const delivery of failed) {
        const task = delivery.taskId ? await loadDeliverableTask(delivery.taskId) : null
        const stillEligible = task && task.status !== "completed" && task.project?.state !== "archived"
            && (await resolveRecipientId(task)) === delivery.recipientId
        if (!task || !stillEligible) {
            await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "suppressed" } })
            continue
        }
        const kind: TaskEmailKind = delivery.kind === "task_overdue" ? "overdue" : "reminder"
        if (await attemptEmail(delivery.id, delivery.recipient.email, task, kind)) retried += 1
    }
    return retried
}

// ─── The sweep (exported for tests: the BullMQ worker calls exactly this) ─────────────────────
export const runReminderSweep = async (now = new Date()) => {
    const reminders = await processDueSchedules("remindAt", now)
    const overdueAlerts = await processDueSchedules("overdueCheckAt", now)
    const retried = await retryFailedEmails(now)
    if (reminders || overdueAlerts || retried) {
        logger.info(`Reminder sweep: reminders=${reminders} overdue=${overdueAlerts} retried=${retried}`)
    }
    return { reminders, overdueAlerts, retried }
}


// ─── Register the schedule + worker ─────────────────────
const startTaskReminderJob = () => {
    logger.info("Starting task reminder queue registration");

    const reminderQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

    // The old once-a-day "due tomorrow" scan is replaced by the per-task sweep; remove its
    // stored schedule so an upgraded Redis doesn't keep firing it.
    reminderQueue
        .removeJobScheduler("daily-task-reminder")
        .catch((error) => logger.error(`Failed to remove the old daily reminder schedule: ${error.stack || error.message}`));

    // upsert (not add) so restarts/redeploys reuse the same schedule instead of stacking duplicates.
    reminderQueue
        .upsertJobScheduler("reminder-sweep", { every: SWEEP_EVERY_MS }, { name: "reminder-sweep" })
        .catch((error) => logger.error(`Failed to schedule the reminder sweep: ${error.stack || error.message}`));

    // concurrency 1: sweeps never overlap on one instance (claims keep multiple instances safe).
    const reminderWorker = new Worker(QUEUE_NAME, () => runReminderSweep(), { connection: redisConnection, concurrency: 1 });

    reminderWorker.on("failed", (job, error) => {
        logger.error(`Reminder sweep ${job?.id} failed: ${error.stack || error.message}`);
    });
}



export default startTaskReminderJob
