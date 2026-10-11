import express from "express";
import protect from "../middlewares/auth.middleware.js";
import {
    getUnreadCount,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
} from "../controllers/notification.controller.js";
import {
    getPreferences,
    getPushPublicKey,
    removePushSubscription,
    savePushSubscription,
    updatePreferences,
} from "../controllers/notificationPreference.controller.js";


const router = express.Router();

// The signed-in account's own notifications, across all its workspaces.
router.use(protect);

router.get("/", listNotifications);
router.get("/unread-count", getUnreadCount);

// Sound + web push settings, and this browser's push subscription.
// NOTE: declared before /:notificationId/read, like /read-all.
router.get("/preferences", getPreferences);
router.put("/preferences", updatePreferences);
router.get("/push/public-key", getPushPublicKey);
router.post("/push/subscriptions", savePushSubscription);
router.delete("/push/subscriptions", removePushSubscription);
// NOTE: /read-all is declared before /:notificationId/read so "read-all" is never taken for an id.
router.post("/read-all", markAllNotificationsRead);
router.post("/:notificationId/read", markNotificationRead);


export default router;
