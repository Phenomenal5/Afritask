import validator from "validator";
import prisma from "../config/prisma.js";
import type { Notification, Prisma } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import routeParam from "../utils/routeParam.js";
import { requireUser } from "../middlewares/auth.middleware.js";

// ─── In-app notifications (SRS SR10) ─────────────────────
// Notifications belong to the signed-in ACCOUNT, across all their workspaces. Each one
// is re-checked when listed: if the task was deleted, or the recipient left/was removed
// from its workspace, the stored summary is withheld and `available` is false — the
// notification itself stays (SRS SR10: suppression doesn't delete history).

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

const notificationInclude = {
    actor: { select: { id: true, name: true, photo: true } },
    workspace: { select: { id: true, name: true } },
} as const satisfies Prisma.NotificationInclude;

type NotificationRow = Notification & Prisma.NotificationGetPayload<{ include: typeof notificationInclude }>;

const UNAVAILABLE_REASONS = {
    taskGone: "This task was deleted.",
    noAccess: "You're no longer a member of this workspace.",
    invitationClosed: "This invitation is no longer open.",
} as const;

// Decide, for a page of notifications, which ones the recipient can still open — in a
// handful of queries rather than one per notification.
const checkAvailability = async (rows: NotificationRow[], userId: string) => {
    const taskIds = [...new Set(rows.flatMap((row) => (row.taskId ? [row.taskId] : [])))];
    const invitationIds = [...new Set(rows.flatMap((row) => (row.invitationId ? [row.invitationId] : [])))];
    const workspaceIds = [...new Set(rows.flatMap((row) => (row.workspaceId ? [row.workspaceId] : [])))];

    const [tasks, memberships, invitations] = await Promise.all([
        taskIds.length ? prisma.task.findMany({ where: { id: { in: taskIds } }, select: { id: true, workspaceId: true } }) : [],
        workspaceIds.length
            ? prisma.membership.findMany({ where: { userId, workspaceId: { in: workspaceIds }, status: "active" }, select: { workspaceId: true } })
            : [],
        invitationIds.length
            ? prisma.invitation.findMany({ where: { id: { in: invitationIds } }, select: { id: true, status: true, expiresAt: true } })
            : [],
    ]);
    const existingTasks = new Map(tasks.map((task) => [task.id, task.workspaceId]));
    const memberOf = new Set(memberships.map((membership) => membership.workspaceId));
    const openInvitations = new Set(
        invitations.filter((invitation) => invitation.status === "pending" && invitation.expiresAt > new Date()).map((invitation) => invitation.id)
    );

    return (row: NotificationRow): string | null => {
        if (row.type === "invitation_received") {
            return row.invitationId && openInvitations.has(row.invitationId) ? null : UNAVAILABLE_REASONS.invitationClosed;
        }
        if (!row.workspaceId || !memberOf.has(row.workspaceId)) return UNAVAILABLE_REASONS.noAccess;
        if (!row.taskId || !existingTasks.has(row.taskId)) return UNAVAILABLE_REASONS.taskGone;
        return null;
    };
};

const toNotificationResponse = (row: NotificationRow, unavailableReason: string | null) => ({
    id: row.id,
    type: row.type,
    createdAt: row.createdAt,
    readAt: row.readAt,
    actor: row.actor,
    workspace: row.workspace,
    taskId: unavailableReason ? null : row.taskId,
    commentId: unavailableReason ? null : row.commentId,
    invitationId: row.type === "invitation_received" && !unavailableReason ? row.invitationId : null,
    // NOTE: never echo the task title to someone who can no longer open the task.
    summary: unavailableReason && row.type !== "invitation_received" ? "" : row.summary,
    available: unavailableReason === null,
    unavailableReason,
});

const countUnread = (userId: string) => prisma.notification.count({ where: { recipientId: userId, readAt: null } });

// ─── GET /api/notifications?unread=true&limit=&before= ─────────────────────
export const listNotifications = catchAsync(async (req, res) => {
    const user = requireUser(req);
    const requestedLimit = Number(req.query.limit);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
    const before = typeof req.query.before === "string" && validator.isUUID(req.query.before) ? req.query.before : undefined;

    const rows = await prisma.notification.findMany({
        where: { recipientId: user.id, ...(req.query.unread === "true" && { readAt: null }) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(before && { cursor: { id: before }, skip: 1 }),
        include: notificationInclude,
    });
    const page = rows.slice(0, limit);
    const reasonFor = await checkAvailability(page, user.id);

    res.status(200).json({
        status: "success",
        data: {
            notifications: page.map((row) => toNotificationResponse(row, reasonFor(row))),
            nextCursor: rows.length > limit ? page[page.length - 1].id : null,
            unreadCount: await countUnread(user.id),
        },
    });
});

// ─── GET /api/notifications/unread-count ─────────────────────
// Cheap enough to poll for the bell badge.
export const getUnreadCount = catchAsync(async (req, res) => {
    res.status(200).json({ status: "success", data: { unreadCount: await countUnread(requireUser(req).id) } });
});

// ─── POST /api/notifications/:notificationId/read ─────────────────────
// Someone else's notification answers 404, like one that doesn't exist.
export const markNotificationRead = catchAsync(async (req, res) => {
    const user = requireUser(req);
    const notificationId = routeParam(req, "notificationId");
    if (!notificationId || !validator.isUUID(notificationId)) throw new AppError("Notification not found", 404);

    const notification = await prisma.notification.findFirst({ where: { id: notificationId, recipientId: user.id }, select: { readAt: true } });
    if (!notification) throw new AppError("Notification not found", 404);
    // Marking twice keeps the first read time.
    if (!notification.readAt) {
        await prisma.notification.update({ where: { id: notificationId }, data: { readAt: new Date() } });
    }

    res.status(200).json({ status: "success", data: { unreadCount: await countUnread(user.id) } });
});

// ─── POST /api/notifications/read-all ─────────────────────
export const markAllNotificationsRead = catchAsync(async (req, res) => {
    const user = requireUser(req);
    const { count } = await prisma.notification.updateMany({
        where: { recipientId: user.id, readAt: null },
        data: { readAt: new Date() },
    });
    res.status(200).json({ status: "success", data: { marked: count, unreadCount: 0 } });
});
