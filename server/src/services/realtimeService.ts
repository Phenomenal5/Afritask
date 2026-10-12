import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { Redis } from "ioredis";
import prisma from "../config/prisma.js";
import env from "../config/env.js";
import logger, { errorMessage } from "../utils/logger.js";
import { sendPushToUser, type PushPayload } from "./pushService.js";

// ─── Live updates: Server-Sent Events + the notification dispatcher ─────────────────────
// Each signed-in tab holds one SSE stream (GET /api/v1/events). Events carry WHAT changed
// and where (ids only) — never content. The tab then refetches through the normal API, so
// every access rule still applies to what it sees.
//
// Events travel over Redis pub/sub, so a change handled by one API instance reaches tabs
// connected to another. Under tests an in-process emitter stands in (no Redis there).

export type LiveEvent =
    | { type: "notification"; notificationId: string }
    | { type: "comment"; action: "created" | "edited" | "deleted"; taskId: string; commentId: string };

// Who an event is for: specific accounts, or every current member of a workspace.
type Audience = { userIds: string[] } | { workspaceId: string };

interface BusMessage {
    audience: Audience;
    event: LiveEvent;
}

const CHANNEL = "afritask:live-events";
const HEARTBEAT_MS = 25_000;

// ─── Local connections (this process) ─────────────────────
const streamsByUser = new Map<string, Set<Response>>();

const writeEvent = (stream: Response, event: LiveEvent) => {
    stream.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
};

const deliverLocally = async ({ audience, event }: BusMessage) => {
    let recipients: string[];
    if ("userIds" in audience) {
        recipients = audience.userIds.filter((userId) => streamsByUser.has(userId));
    } else {
        // Only connected users who are CURRENT members of an active workspace — checked at
        // delivery time, so someone removed a second ago gets nothing.
        const connectedUserIds = [...streamsByUser.keys()];
        if (connectedUserIds.length === 0) return;
        const members = await prisma.membership.findMany({
            where: { workspaceId: audience.workspaceId, userId: { in: connectedUserIds }, workspace: { deletedAt: null, suspendedAt: null } },
            select: { userId: true },
        });
        recipients = members.map((member) => member.userId);
    }
    for (const userId of recipients) {
        for (const stream of streamsByUser.get(userId) ?? []) writeEvent(stream, event);
    }
};

// ─── The bus ─────────────────────
const localBus = new EventEmitter();
let publisher: Redis | null = null;
let subscriber: Redis | null = null;

const handleBusMessage = (raw: string) => {
    try {
        deliverLocally(JSON.parse(raw) as BusMessage).catch((error) => logger.error(`Live event delivery failed: ${errorMessage(error)}`));
    } catch (error) {
        logger.error(`Unreadable live event: ${errorMessage(error)}`);
    }
};

// NOTE: connected lazily, on the first stream or event — importing this module must not
// open Redis connections (scripts and tests import controllers that import it).
const ensureBus = () => {
    if (env.isTest) {
        if (localBus.listenerCount(CHANNEL) === 0) localBus.on(CHANNEL, handleBusMessage);
        return;
    }
    if (publisher) return;
    publisher = new Redis(env.redisUrl, { lazyConnect: false, maxRetriesPerRequest: null });
    subscriber = publisher.duplicate();
    subscriber.subscribe(CHANNEL).catch((error) => logger.error(`Live events: couldn't subscribe: ${errorMessage(error)}`));
    subscriber.on("message", (_channel, raw) => handleBusMessage(raw));
    for (const connection of [publisher, subscriber]) {
        connection.on("error", (error) => logger.error(`Live events Redis error: ${errorMessage(error)}`));
    }
};

export const publishLiveEvent = (audience: Audience, event: LiveEvent) => {
    ensureBus();
    const raw = JSON.stringify({ audience, event } satisfies BusMessage);
    if (env.isTest) {
        localBus.emit(CHANNEL, raw);
        return;
    }
    publisher!.publish(CHANNEL, raw).catch((error) => logger.error(`Live event publish failed: ${errorMessage(error)}`));
};

// ─── GET /api/v1/events ─────────────────────
export const openEventStream = (req: Request, res: Response) => {
    ensureBus();
    const userId = req.user!.id;

    res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Stops nginx-style proxies from buffering the stream.
        "X-Accel-Buffering": "no",
    });
    // Reconnect after 5s if the connection drops.
    res.write("retry: 5000\n\n");
    res.write(`event: ready\ndata: {}\n\n`);

    const streams = streamsByUser.get(userId) ?? new Set<Response>();
    streams.add(res);
    streamsByUser.set(userId, streams);

    const heartbeat = setInterval(() => res.write(": keep-alive\n\n"), HEARTBEAT_MS);
    // NOTE: the stream was authorised with a 15-minute access token. End it when that
    // token would expire, so a signed-out or suspended account can't keep listening: the
    // browser reconnects, and that request is checked again (refreshing first if needed).
    const lifetime = setTimeout(() => res.end(), env.accessTokenTtlMinutes * 60 * 1000);

    req.on("close", () => {
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        streams.delete(res);
        if (streams.size === 0) streamsByUser.delete(userId);
    });
};

// ─── Notification dispatcher ─────────────────────
// Hands each new notification to the live channels exactly once: an SSE event to the
// recipient's open tabs (badge + sound) and web push to their devices (if turned on).
// Called right after a change commits, and by the minute sweep as a safety net.

// Older than this and it's not worth interrupting anyone (e.g. after an outage).
const DISPATCH_WINDOW_MS = 15 * 60 * 1000;
const DISPATCH_BATCH = 200;

const PUSH_TITLES: Record<string, string> = {
    task_assigned: "Assigned to you",
    comment_mention: "You were mentioned",
    invitation_received: "New invitation",
    task_reminder: "Reminder",
    task_overdue: "Overdue",
    task_starting: "Starting tomorrow",
    support_reply: "Afritask support replied",
};

export const dispatchPendingNotifications = async () => {
    const pending = await prisma.notification.findMany({
        where: { dispatchedAt: null, createdAt: { gt: new Date(Date.now() - DISPATCH_WINDOW_MS) } },
        orderBy: { createdAt: "asc" },
        take: DISPATCH_BATCH,
        include: { actor: { select: { name: true } } },
    });

    let dispatched = 0;
    for (const notification of pending) {
        // Claim: only the dispatcher that sets it first sends it.
        const { count } = await prisma.notification.updateMany({ where: { id: notification.id, dispatchedAt: null }, data: { dispatchedAt: new Date() } });
        if (count === 0) continue;
        dispatched += 1;

        publishLiveEvent({ userIds: [notification.recipientId] }, { type: "notification", notificationId: notification.id });

        const actorPrefix = notification.actor?.name && notification.type !== "task_reminder" && notification.type !== "task_overdue" && notification.type !== "task_starting" ? `${notification.actor.name}: ` : "";
        const payload: PushPayload = {
            title: PUSH_TITLES[notification.type] ?? "Afritask",
            body: `${actorPrefix}${notification.summary}`.slice(0, 180),
            url: `/notifications?open=${notification.id}`,
            tag: notification.taskId ?? notification.invitationId ?? notification.id,
        };
        await sendPushToUser(notification.recipientId, payload).catch((error) => logger.error(`Push for notification ${notification.id} failed: ${errorMessage(error)}`));
    }
    return dispatched;
};

// After a request's transaction commits: dispatch without making the response wait.
// NOTE: skipped under tests — background work outliving a test would race the next test's
// database reset. Tests call dispatchPendingNotifications() directly.
export const dispatchNotificationsSoon = () => {
    if (env.isTest) return;
    setImmediate(() => {
        dispatchPendingNotifications().catch((error) => logger.error(`Notification dispatch failed: ${errorMessage(error)}`));
    });
};
