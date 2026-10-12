"use client";

/**
 * Live updates for the signed-in app:
 * - one Server-Sent Events stream (GET /api/v1/events): a new notification refreshes the
 *   bell badge and plays the chime (if sound is on); a comment change tells any open
 *   thread on that task to reload;
 * - notification preferences (sound, web push) and this browser's push permission. When
 *   push is ON and the browser hasn't decided yet, the browser's own Allow / Block prompt
 *   is shown on load — like the location prompt. Browsers that only allow it after a click
 *   get the "Turn on notifications" banner instead (PushPermissionBanner).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import api from "@/lib/api";
import { useMyWork } from "@/context/MyWorkContext";
import { getNotificationPreferences, updateNotificationPreferences, type NotificationPreferences } from "@/lib/services/notificationPreferenceService";
import { askPermission, currentPermission, pushSupport, subscribeThisBrowser, unsubscribeThisBrowser, type PushSupport } from "@/utils/browserPush";
import { playChime, preloadChime } from "@/utils/chime";
import { failureMessage } from "@/lib/errors";
import type { ActionResult } from "@/types/models";

// Fired on window when someone adds/edits/deletes a comment on a task — TaskComments
// listens and reloads its thread if it's showing that task.
export const COMMENT_CHANGED_EVENT = "afritask:comment-changed";

const EVENTS_URL = "/api/v1/events";
// After an unexpected drop, wait before reconnecting (EventSource retries by itself for
// network blips; this is for when it gives up, e.g. the access token expired).
const RECONNECT_DELAY_MS = 3_000;

interface LiveUpdatesState {
  preferences: NotificationPreferences | null;
  permission: NotificationPermission | "unsupported";
  support: PushSupport;
  setSoundEnabled: (enabled: boolean) => Promise<ActionResult>;
  setPushEnabled: (enabled: boolean) => Promise<ActionResult>;
  // From a click (banner / settings): ask the browser, then register this browser.
  requestPushPermission: () => Promise<ActionResult>;
  testChime: () => void;
}

const LiveUpdatesContext = createContext<LiveUpdatesState | null>(null);

export function LiveUpdatesProvider({ children }: { children: ReactNode }) {
  const { refreshUnreadNotifications, reloadInvitations } = useMyWork();
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("unsupported");
  const [support, setSupport] = useState<PushSupport>("unsupported");

  // The stream's handlers read the latest values through refs, so it never reconnects
  // just because a preference changed.
  const soundEnabledRef = useRef(true);
  const refreshUnreadRef = useRef(refreshUnreadNotifications);
  const reloadInvitationsRef = useRef(reloadInvitations);
  useEffect(() => {
    soundEnabledRef.current = preferences?.soundEnabled ?? true;
  }, [preferences]);
  useEffect(() => {
    refreshUnreadRef.current = refreshUnreadNotifications;
    reloadInvitationsRef.current = reloadInvitations;
  }, [refreshUnreadNotifications, reloadInvitations]);

  // ─── Preferences + the permission prompt on load ─────────────────────
  useEffect(() => {
    let cancelled = false;
    setSupport(pushSupport());
    setPermission(currentPermission());
    getNotificationPreferences()
      .then(async (response) => {
        if (cancelled) return;
        const loaded = response.data.data.preferences;
        setPreferences(loaded);
        if (!loaded.pushEnabled || !loaded.pushAvailable || pushSupport() !== "supported") return;
        // Push is on: make sure THIS browser can deliver it.
        let browserPermission = currentPermission();
        if (browserPermission === "default") browserPermission = await askPermission();
        if (cancelled) return;
        setPermission(browserPermission);
        if (browserPermission === "granted") await subscribeThisBrowser().catch(() => undefined);
      })
      .catch(() => {
        // Defaults apply (sound on, push off); the settings page shows its own error.
        if (!cancelled) setPreferences({ soundEnabled: true, pushEnabled: false, pushAvailable: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ─── The event stream ─────────────────────
  useEffect(() => {
    let source: EventSource | null = null;
    let reconnectTimer: number | undefined;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      source = new EventSource(EVENTS_URL);
      source.addEventListener("notification", (message) => {
        refreshUnreadRef.current();
        // It may be an invitation: refresh the open invitations so the dashboard's
        // "You're invited" box shows it straight away.
        reloadInvitationsRef.current();
        // Every notification makes a sound (when sound is on) — in a background tab too.
        // playChime makes sure only one open tab plays it; the service worker keeps the
        // matching push notification silent while a tab is open, so it's never doubled.
        if (!soundEnabledRef.current) return;
        let notificationId: string | undefined;
        try {
          notificationId = JSON.parse((message as MessageEvent<string>).data).notificationId;
        } catch {
          // Still play it, just without the one-tab-only lock.
        }
        playChime(notificationId);
      });
      source.addEventListener("comment", (message) => {
        try {
          const detail = JSON.parse((message as MessageEvent<string>).data);
          window.dispatchEvent(new CustomEvent(COMMENT_CHANGED_EVENT, { detail }));
        } catch {
          // Malformed event — ignore it; the thread still reloads on its own actions.
        }
      });
      source.onerror = async () => {
        // CONNECTING = the browser is already retrying a dropped connection.
        if (!source || source.readyState !== EventSource.CLOSED) return;
        // CLOSED = it was refused (usually a 401: the 15-minute access token expired, and
        // the server ends streams then). Refresh the token, then reconnect.
        source = null;
        try {
          await api.post("/auth/refresh");
        } catch {
          // Session really over — AuthContext takes it from here (the next API call 401s).
          return;
        }
        reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    preloadChime();
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(reconnectTimer);
      source?.close();
    };
  }, []);

  // ─── Actions ─────────────────────
  const savePreference = useCallback(async (changes: Partial<Pick<NotificationPreferences, "soundEnabled" | "pushEnabled">>): Promise<ActionResult> => {
    try {
      const response = await updateNotificationPreferences(changes);
      setPreferences(response.data.data.preferences);
      return { success: true };
    } catch (error) {
      return { success: false, message: failureMessage(error, "That setting didn't save. Try again.") };
    }
  }, []);

  const setSoundEnabled = useCallback((enabled: boolean) => savePreference({ soundEnabled: enabled }), [savePreference]);

  const requestPushPermission = useCallback(async (): Promise<ActionResult> => {
    if (pushSupport() === "development") return { success: false, message: "Push works in the installed or production app, not in development mode." };
    if (pushSupport() !== "supported") return { success: false, message: "This browser can't show push notifications." };
    const result = await askPermission();
    setPermission(result);
    if (result === "denied") return { success: false, message: "Notifications are blocked for Afritask in this browser. Allow them in the site settings (the icon next to the address), then try again." };
    if (result !== "granted") return { success: false, message: "Notifications weren't allowed. You can try again any time." };
    try {
      await subscribeThisBrowser();
      return { success: true };
    } catch (error) {
      return { success: false, message: failureMessage(error, "This browser couldn't register for notifications. Try again.") };
    }
  }, []);

  // Turning push on happens from a click, so the browser prompt is allowed right away.
  const setPushEnabled = useCallback(
    async (enabled: boolean): Promise<ActionResult> => {
      if (!enabled) {
        await unsubscribeThisBrowser();
        return savePreference({ pushEnabled: false });
      }
      // Save first: the server must know push is wanted before this browser registers.
      const saved = await savePreference({ pushEnabled: true });
      if (!saved.success) return saved;
      return requestPushPermission();
    },
    [savePreference, requestPushPermission]
  );

  const value = useMemo<LiveUpdatesState>(
    () => ({ preferences, permission, support, setSoundEnabled, setPushEnabled, requestPushPermission, testChime: () => playChime() }),
    [preferences, permission, support, setSoundEnabled, setPushEnabled, requestPushPermission]
  );
  return <LiveUpdatesContext.Provider value={value}>{children}</LiveUpdatesContext.Provider>;
}

export function useLiveUpdates(): LiveUpdatesState {
  const context = useContext(LiveUpdatesContext);
  if (!context) throw new Error("useLiveUpdates must be used within a LiveUpdatesProvider");
  return context;
}
