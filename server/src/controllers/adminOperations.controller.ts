import { Queue } from "bullmq";
import validator from "validator";
import prisma from "../config/prisma.js";
import redisConnection from "../config/redis.js";
import type { EmailDeliveryStatus, Prisma } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger, { errorMessage } from "../utils/logger.js";
import routeParam from "../utils/routeParam.js";
import { requireOperatorContext } from "../middlewares/operatorAuth.middleware.js";
import { recordAdminAudit, requestIp } from "../services/adminAuditService.js";
import { runReadinessChecks } from "./health.controller.js";
import { REMINDER_QUEUE_NAME, redeliver } from "../jobs/taskReminder.js";
import { pageOf, parsePaging, parseReason } from "./adminDirectory.controller.js";

// ─── Operations: health, delivery failures, audit (SRS SR18 / FR18) ─────────────────────
// Failure details are the provider's sanitised error text — never task or comment bodies.

const QUEUE_CHECK_TIMEOUT_MS = 3_000;
const DELIVERY_STATUSES: EmailDeliveryStatus[] = ["pending", "sent", "failed", "suppressed"];

// Job counts for the reminder queue, or null when Redis can't be reached in time.
const reminderQueueCounts = async () => {
    const queue = new Queue(REMINDER_QUEUE_NAME, { connection: redisConnection });
    try {
        const counts = await Promise.race([
            queue.getJobCounts("waiting", "active", "delayed", "failed"),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), QUEUE_CHECK_TIMEOUT_MS)),
        ]);
        return { waiting: counts.waiting ?? 0, active: counts.active ?? 0, delayed: counts.delayed ?? 0, failed: counts.failed ?? 0 };
    } catch (error) {
        logger.warn(`Queue counts unavailable: ${errorMessage(error)}`);
        return null;
    } finally {
        await queue.close().catch(() => undefined);
    }
};

// GET /api/admin/operations/health
export const getOperationsHealth = catchAsync(async (req, res) => {
    const report = await runReadinessChecks();
    // Only ask for queue depth when Redis answered — otherwise the client would sit retrying.
    const [queueCounts, failedDeliveries, pendingDeliveries] = await Promise.all([
        report.checks.redis?.status === "ok" ? reminderQueueCounts() : Promise.resolve(null),
        prisma.emailDelivery.count({ where: { status: "failed" } }),
        prisma.emailDelivery.count({ where: { status: "pending" } }),
    ]);
    res.status(200).json({
        status: "success",
        data: {
            ...report,
            ...(queueCounts && { queues: { [REMINDER_QUEUE_NAME]: queueCounts } }),
            deliveries: { failed: failedDeliveries, pending: pendingDeliveries },
        },
    });
});

const deliveryInclude = { recipient: { select: { id: true, email: true } } } as const satisfies Prisma.EmailDeliveryInclude;
type DeliveryRow = Prisma.EmailDeliveryGetPayload<{ include: typeof deliveryInclude }>;

// The workspace each delivery's task belongs to (tasks may have been deleted since).
const withWorkspaceIds = async (deliveries: DeliveryRow[]) => {
    const taskIds = [...new Set(deliveries.flatMap((delivery) => (delivery.taskId ? [delivery.taskId] : [])))];
    const tasks = taskIds.length ? await prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, workspaceId: true } }) : [];
    const workspaceByTask = new Map(tasks.map((task) => [task.id, task.workspaceId]));
    return deliveries.map((delivery) => ({
        id: delivery.id,
        kind: delivery.kind,
        status: delivery.status,
        attempts: delivery.attempts,
        lastError: delivery.lastError,
        recipient: delivery.recipient,
        taskId: delivery.taskId,
        workspaceId: delivery.taskId ? workspaceByTask.get(delivery.taskId) ?? null : null,
        createdAt: delivery.createdAt,
        updatedAt: delivery.updatedAt,
    }));
};

// GET /api/admin/deliveries?status=failed|pending|sent|suppressed&page=&limit=
export const listDeliveries = catchAsync(async (req, res) => {
    const paging = parsePaging(req.query);
    const status = req.query.status;
    if (status !== undefined && status !== "" && !DELIVERY_STATUSES.includes(status as EmailDeliveryStatus)) {
        throw new AppError(`status must be one of ${DELIVERY_STATUSES.join(", ")}`, 400);
    }
    const where: Prisma.EmailDeliveryWhereInput = status ? { status: status as EmailDeliveryStatus } : {};

    const [deliveries, total] = await Promise.all([
        prisma.emailDelivery.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: paging.skip, take: paging.limit, include: deliveryInclude }),
        prisma.emailDelivery.count({ where }),
    ]);
    res.status(200).json({ status: "success", data: pageOf(await withWorkspaceIds(deliveries), total, paging) });
});

// POST /api/admin/deliveries/:deliveryId/retry  { reason }
// Same delivery identity (no duplicate rows), and the same re-check as automatic retries:
// work that's finished, deleted, archived, closed or reassigned is suppressed, not sent.
// Allowed after the automatic attempts run out — that's what this button is for.
export const retryDelivery = catchAsync(async (req, res) => {
    const { operator } = requireOperatorContext(req);
    const deliveryId = routeParam(req, "deliveryId");
    if (!deliveryId || !validator.isUUID(deliveryId)) throw new AppError("Delivery not found", 404);
    const reason = parseReason(req.body?.reason);

    const delivery = await prisma.emailDelivery.findUnique({ where: { id: deliveryId }, include: deliveryInclude });
    if (!delivery) throw new AppError("Delivery not found", 404);
    // NOTE: a known-successful email is never resent (SRS SR10).
    if (delivery.status !== "failed") throw new AppError(`Only failed deliveries can be retried (this one is ${delivery.status}).`, 409);

    const outcome = await redeliver(delivery);
    await prisma.$transaction((transaction) =>
        recordAdminAudit(transaction, { actorId: operator.userId, action: "delivery.retried", targetType: "delivery", targetId: delivery.id, reason, metadata: { outcome }, ipAddress: requestIp(req) })
    );

    logger.info(`Delivery retried deliveryId=${delivery.id} outcome=${outcome} by operator=${operator.userId}`);
    const updated = await prisma.emailDelivery.findUniqueOrThrow({ where: { id: delivery.id }, include: deliveryInclude });
    res.status(200).json({ status: "success", data: { delivery: (await withWorkspaceIds([updated]))[0], outcome } });
});

// GET /api/admin/audit?action=&targetId=&page=&limit=
export const listAudit = catchAsync(async (req, res) => {
    const paging = parsePaging(req.query);
    const where: Prisma.AdminAuditEntryWhereInput = {};
    if (typeof req.query.action === "string" && req.query.action) where.action = req.query.action.slice(0, 100);
    if (typeof req.query.targetId === "string" && validator.isUUID(req.query.targetId)) where.targetId = req.query.targetId;

    const [entries, total] = await Promise.all([
        prisma.adminAuditEntry.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: paging.skip,
            take: paging.limit,
            select: {
                id: true,
                action: true,
                targetType: true,
                targetId: true,
                reason: true,
                ipAddress: true,
                createdAt: true,
                actor: { select: { id: true, name: true, email: true } },
            },
        }),
        prisma.adminAuditEntry.count({ where }),
    ]);
    res.status(200).json({ status: "success", data: pageOf(entries, total, paging) });
});
