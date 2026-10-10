import express from "express";
import protect from "../middlewares/auth.middleware.js";
import {
    getUnreadCount,
    listNotifications,
    markAllNotificationsRead,
    markNotificationRead,
} from "../controllers/notification.controller.js";


const router = express.Router();

// The signed-in account's own notifications, across all its workspaces.
router.use(protect);

router.get("/", listNotifications);
router.get("/unread-count", getUnreadCount);
// NOTE: /read-all is declared before /:notificationId/read so "read-all" is never taken for an id.
router.post("/read-all", markAllNotificationsRead);
router.post("/:notificationId/read", markNotificationRead);


export default router;
