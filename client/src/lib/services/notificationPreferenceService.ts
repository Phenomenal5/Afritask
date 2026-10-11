/**
 * Notification sound + web push settings, and this browser's push subscription.
 */
import api from "@/lib/api";

export interface NotificationPreferences {
  soundEnabled: boolean;
  pushEnabled: boolean;
  // False when the server has no push keys — the push switch is hidden.
  pushAvailable: boolean;
}

export const getNotificationPreferences = () => api.get<{ data: { preferences: NotificationPreferences } }>("/notifications/preferences");

export const updateNotificationPreferences = (changes: Partial<Pick<NotificationPreferences, "soundEnabled" | "pushEnabled">>) =>
  api.put<{ data: { preferences: NotificationPreferences } }>("/notifications/preferences", changes);

export const getPushPublicKey = () => api.get<{ data: { publicKey: string } }>("/notifications/push/public-key");

export const savePushSubscription = (subscription: PushSubscriptionJSON) => api.post("/notifications/push/subscriptions", subscription);

export const removePushSubscription = (endpoint: string) => api.delete("/notifications/push/subscriptions", { data: { endpoint } });
