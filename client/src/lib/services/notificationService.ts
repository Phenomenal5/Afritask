/**
 * Notification service wrappers. Notifications belong to the signed-in account across
 * all of its workspaces; the server re-checks access to what each one points at.
 */
import api from "@/lib/api";

export const getNotifications = (params: { unread?: boolean; before?: string } = {}) =>
  api.get("/notifications", { params: { unread: params.unread ? "true" : undefined, before: params.before } });

export const getUnreadNotificationCount = () => api.get("/notifications/unread-count");

export const markNotificationRead = (notificationId: string) => api.post(`/notifications/${notificationId}/read`);

export const markAllNotificationsRead = () => api.post("/notifications/read-all");
