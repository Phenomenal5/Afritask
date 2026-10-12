import webpush from "web-push";
import prisma from "../config/prisma.js";
import env from "../config/env.js";
import logger, { errorMessage } from "../utils/logger.js";

// ─── Web push ─────────────────────
// Sends a notification to every browser/device an account registered, if the account has
// push turned on. Optional: without VAPID keys, push is "not configured" and nothing here
// runs. Payloads hold only what the system notification shows (title, a short line, a
// link) — opening the link goes through the app's normal access checks.

export interface PushPayload {
    title: string;
    body: string;
    // Path in the web app to open when the notification is clicked.
    url: string;
    // Same tag = the newer notification replaces the older one on the device.
    tag: string;
}

export const isPushConfigured = () => Boolean(env.vapidPublicKey && env.vapidPrivateKey);

let vapidReady = false;
const ensureVapid = () => {
    if (vapidReady || !isPushConfigured()) return;
    // All three are set together or not at all (config/env.ts refuses half a setup).
    webpush.setVapidDetails(env.vapidSubject!, env.vapidPublicKey!, env.vapidPrivateKey!);
    vapidReady = true;
};

// ─── Test outbox ─────────────────────
// NOTE: test seam, like testMailbox in utils/email.ts. Under NODE_ENV=test nothing goes to
// a push service — payloads are captured here, and `goneEndpoints` makes the "push
// service" answer 410 Gone for those endpoints.
export const testPushOutbox = {
    sent: [] as { endpoint: string; payload: PushPayload }[],
    goneEndpoints: new Set<string>(),
};

// Push services answer 404/410 when a subscription is gone (unsubscribed, browser data
// cleared, app uninstalled). Anything else is treated as temporary.
const isGone = (error: unknown) => {
    const statusCode = (error as { statusCode?: number })?.statusCode;
    return statusCode === 404 || statusCode === 410;
};

const sendToSubscription = async (subscription: { endpoint: string; p256dh: string; auth: string }, payload: PushPayload) => {
    if (env.isTest) {
        if (testPushOutbox.goneEndpoints.has(subscription.endpoint)) throw Object.assign(new Error("Gone"), { statusCode: 410 });
        testPushOutbox.sent.push({ endpoint: subscription.endpoint, payload });
        return;
    }
    ensureVapid();
    await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        JSON.stringify(payload),
        // Undelivered after a day isn't worth showing.
        { TTL: 24 * 60 * 60 },
    );
};

// Returns how many devices it reached. Never throws: push is best effort.
export const sendPushToUser = async (userId: string, payload: PushPayload) => {
    if (!isPushConfigured() && !env.isTest) return 0;

    // Push on, and the account not suspended (a suspended account gets no notifications).
    const preference = await prisma.notificationPreference.findFirst({ where: { userId, pushEnabled: true, user: { suspendedAt: null } } });
    if (!preference) return 0;

    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
    let delivered = 0;
    for (const subscription of subscriptions) {
        try {
            await sendToSubscription(subscription, payload);
            delivered += 1;
            await prisma.pushSubscription.update({ where: { id: subscription.id }, data: { lastUsedAt: new Date() } });
        } catch (error) {
            if (isGone(error)) {
                await prisma.pushSubscription.deleteMany({ where: { id: subscription.id } });
                logger.info(`Push subscription ${subscription.id} is gone — removed`);
            } else {
                logger.warn(`Push to subscription ${subscription.id} failed: ${errorMessage(error)}`);
            }
        }
    }
    return delivered;
};
