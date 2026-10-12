import prisma from "../config/prisma.js";
import env from "../config/env.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger from "../utils/logger.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { isPushConfigured } from "../services/pushService.js";

// ─── Notification preferences + this browser's push subscription ─────────────────────

const DEFAULT_PREFERENCES = { soundEnabled: true, pushEnabled: false };

const preferencesOf = async (userId: string) => {
    const saved = await prisma.notificationPreference.findUnique({ where: { userId }, select: { soundEnabled: true, pushEnabled: true } });
    return { ...(saved ?? DEFAULT_PREFERENCES), pushAvailable: isPushConfigured() };
};

// GET /api/v1/notifications/preferences
// pushAvailable: false when the server has no VAPID keys — the client hides the push switch.
export const getPreferences = catchAsync(async (req, res) => {
    res.status(200).json({ status: "success", data: { preferences: await preferencesOf(requireUser(req).id) } });
});

// PUT /api/v1/notifications/preferences  { soundEnabled?, pushEnabled? }
export const updatePreferences = catchAsync(async (req, res) => {
    const userId = requireUser(req).id;
    const { soundEnabled, pushEnabled } = req.body ?? {};
    const changes: { soundEnabled?: boolean; pushEnabled?: boolean } = {};
    if (soundEnabled !== undefined) {
        if (typeof soundEnabled !== "boolean") throw new AppError("We couldn't save that setting. Try again.", 400);
        changes.soundEnabled = soundEnabled;
    }
    if (pushEnabled !== undefined) {
        if (typeof pushEnabled !== "boolean") throw new AppError("We couldn't save that setting. Try again.", 400);
        if (pushEnabled && !isPushConfigured()) throw new AppError("Push notifications aren't available yet. You'll still get them in Afritask and by email.", 409);
        changes.pushEnabled = pushEnabled;
    }
    if (Object.keys(changes).length === 0) throw new AppError("No settings were changed.", 400);

    await prisma.notificationPreference.upsert({
        where: { userId },
        create: { userId, ...DEFAULT_PREFERENCES, ...changes },
        update: changes,
    });
    // Turning push off stops it everywhere at once — the devices' subscriptions go too.
    if (changes.pushEnabled === false) await prisma.pushSubscription.deleteMany({ where: { userId } });

    logger.info(`Notification preferences updated for user ${userId}: ${JSON.stringify(changes)}`);
    res.status(200).json({ status: "success", data: { preferences: await preferencesOf(userId) } });
});

// GET /api/v1/notifications/push/public-key — what the browser subscribes with.
export const getPushPublicKey = catchAsync(async (_req, res) => {
    if (!isPushConfigured()) throw new AppError("Push notifications aren't available yet. You'll still get them in Afritask and by email.", 404);
    res.status(200).json({ status: "success", data: { publicKey: env.vapidPublicKey } });
});

// NOTE: the server POSTs to this URL whenever the person gets a notification. Any https URL
// would let someone point it at an internal address (SSRF), so only the browsers' own push
// services are accepted: Chrome/Edge (FCM), Firefox (Mozilla), Safari (Apple), Windows (WNS).
const PUSH_SERVICE_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];
const isPushServiceUrl = (value: unknown): value is string => {
    if (typeof value !== "string" || value.length > 1000) return false;
    try {
        const url = new URL(value);
        const isPushService = PUSH_SERVICE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
        return url.protocol === "https:" && !url.port && isPushService;
    } catch {
        return false;
    }
};

const isKey = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 200 && /^[A-Za-z0-9_-]+=*$/.test(value);

// POST /api/v1/notifications/push/subscriptions  { endpoint, keys: { p256dh, auth } }
// The browser's PushSubscription.toJSON(). Saving the same endpoint again (or from another
// account on a shared browser) moves it to the current account.
export const savePushSubscription = catchAsync(async (req, res) => {
    const userId = requireUser(req).id;
    const { endpoint, keys } = req.body ?? {};
    if (!isPushServiceUrl(endpoint) || !isKey(keys?.p256dh) || !isKey(keys?.auth)) throw new AppError("This browser couldn't turn on notifications. Try again.", 400);

    const subscription = { userId, p256dh: keys.p256dh as string, auth: keys.auth as string, userAgent: req.get("user-agent")?.slice(0, 300) ?? null };
    await prisma.pushSubscription.upsert({ where: { endpoint }, create: { endpoint, ...subscription }, update: subscription });
    res.status(201).json({ status: "success", message: "This browser will get push notifications." });
});

// DELETE /api/v1/notifications/push/subscriptions  { endpoint } — this browser stops (e.g. signing out).
export const removePushSubscription = catchAsync(async (req, res) => {
    const { endpoint } = req.body ?? {};
    if (typeof endpoint !== "string") throw new AppError("This browser couldn't turn off notifications. Try again.", 400);
    // Only the caller's own subscription — an endpoint isn't proof of anything by itself.
    await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: requireUser(req).id } });
    res.status(204).send();
});
