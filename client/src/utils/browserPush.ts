// This browser's side of web push: permission, the service worker's PushSubscription, and
// registering it with the server. Everything here is best effort — when a browser can't do
// push, the app works the same, just without system notifications.
import { getPushPublicKey, removePushSubscription, savePushSubscription } from "@/lib/services/notificationPreferenceService";

export type PushSupport = "supported" | "unsupported";

// The browser can do web push. (The service worker that receives pushes is registered in
// every build: push-only in development, see ServiceWorkerManager.)
export const pushSupport = (): PushSupport =>
  typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window ? "supported" : "unsupported";

export const currentPermission = (): NotificationPermission | "unsupported" =>
  typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported";

// Shows the browser's own Allow / Block prompt (like the location prompt). Some browsers
// (Safari) only show it in response to a click, and answer "default" otherwise.
export const askPermission = async (): Promise<NotificationPermission> => {
  if (!("Notification" in window)) return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    // Very old browsers only support the callback form.
    return new Promise((resolve) => Notification.requestPermission(resolve));
  }
};

// The VAPID key arrives base64url-encoded; the browser wants the raw bytes.
const keyBytes = (base64Url: string) => {
  const padded = `${base64Url}${"=".repeat((4 - (base64Url.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const binary = window.atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

// Subscribe this browser (or reuse its existing subscription) and tell the server.
// Call only once permission is "granted".
export const subscribeThisBrowser = async () => {
  if (pushSupport() !== "supported") return false;
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    const { data } = await getPushPublicKey();
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(data.data.publicKey) });
  }
  await savePushSubscription(subscription.toJSON());
  return true;
};

// Stop push to this browser (signing out, or turning push off).
export const unsubscribeThisBrowser = async () => {
  if (pushSupport() !== "supported") return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    await removePushSubscription(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe();
  } catch {
    // Nothing to clean up, or the browser refused — either way, nothing more to do.
  }
};
