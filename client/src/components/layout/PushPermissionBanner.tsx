"use client";

// Shown only when push is turned ON in settings but this browser can't deliver it yet:
// - permission undecided (browsers like Safari only show their prompt after a click), or
// - permission blocked (only the person can undo that, in the browser's site settings).
// Dismissing hides it for this tab session; the settings page always shows the state.
import { useEffect, useState } from "react";
import { BellOff, BellRing, X } from "lucide-react";
import { useLiveUpdates } from "@/context/LiveUpdatesContext";
import Button from "@/components/ui/Button";

const DISMISSED_KEY = "afritask:push-banner-dismissed";

export default function PushPermissionBanner() {
  const { preferences, permission, support, requestPushPermission } = useLiveUpdates();
  const [dismissed, setDismissed] = useState(true);
  const [asking, setAsking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const needsAttention = preferences?.pushEnabled && preferences.pushAvailable && support === "supported" && (permission === "default" || permission === "denied");
  if (!needsAttention || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Storage blocked — it just shows again next load.
    }
  };

  const allow = async () => {
    setAsking(true);
    const result = await requestPushPermission();
    setAsking(false);
    setMessage(result.success ? null : result.message ?? null);
  };

  const blocked = permission === "denied";
  return (
    <div role="status" className="flex items-start gap-3 border-b border-line bg-surface-muted px-4 py-2.5 text-[14px] text-ink sm:px-8">
      {blocked ? <BellOff size={18} aria-hidden="true" className="mt-0.5 shrink-0" /> : <BellRing size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-forest" />}
      <div className="min-w-0 flex-1">
        {blocked ? (
          <p>
            <strong>Notifications are blocked for Afritask in this browser.</strong> Push is on in your settings — to get it here, allow notifications in the site
            settings (the icon next to the address).
          </p>
        ) : (
          <p>
            <strong>Allow notifications?</strong> Push is on in your settings. Let this browser show them so you hear about assignments and mentions even when Afritask
            isn&apos;t open.
          </p>
        )}
        {message && <p className="mt-1 text-brick">{message}</p>}
      </div>
      {!blocked && (
        <Button size="sm" loading={asking} onClick={allow}>
          Allow
        </Button>
      )}
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="rounded p-1 text-muted hover:bg-surface hover:text-ink">
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
