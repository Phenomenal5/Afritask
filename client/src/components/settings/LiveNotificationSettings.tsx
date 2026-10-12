"use client";

// Settings → Notifications: the notification sound and web push for this account, plus
// what THIS browser allows. Each switch saves straight away.
import { useState } from "react";
import { BellRing, Volume2 } from "lucide-react";
import { useLiveUpdates } from "@/context/LiveUpdatesContext";
import { cx } from "@/lib/cx";

function SettingSwitch({
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  onChange,
  children,
}: {
  icon: typeof BellRing;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-line bg-surface p-4">
      <label className={cx("flex items-start gap-3", !disabled && "cursor-pointer")}>
        <Icon size={19} aria-hidden="true" className="mt-0.5 shrink-0 text-forest" />
        <span className="flex-1 text-[14.5px]">
          <span className="block font-semibold text-ink">{title}</span>
          <span className="mt-0.5 block text-muted">{description}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          aria-label={title}
          className="mt-1 size-[20px] shrink-0 accent-[var(--forest)]"
        />
      </label>
      {children}
    </div>
  );
}

const PERMISSION_TEXT: Record<string, string> = {
  granted: "This browser shows Afritask notifications.",
  denied: "Blocked in this browser. Allow notifications for Afritask in the site settings (the icon next to the address).",
  default: "This browser hasn't been asked yet. Turning push on will ask it.",
};

export default function LiveNotificationSettings() {
  const { preferences, permission, support, setSoundEnabled, setPushEnabled, testChime } = useLiveUpdates();
  const [saving, setSaving] = useState<"sound" | "push" | null>(null);
  const [message, setMessage] = useState<{ tone: "saved" | "failed"; text: string } | null>(null);

  const run = async (which: "sound" | "push", action: () => Promise<{ success: boolean; message?: string }>, savedText: string) => {
    setSaving(which);
    setMessage(null);
    const result = await action();
    setSaving(null);
    setMessage(result.success ? { tone: "saved", text: savedText } : { tone: "failed", text: result.message ?? "That setting didn't save. Try again." });
  };

  if (!preferences) return <p className="text-[14px] text-muted">Loading your notification settings...</p>;

  const pushNote =
    !preferences.pushAvailable
      ? "Push isn't set up on this server yet."
      : support === "unsupported"
        ? "This browser can't show notifications. You'll still get them in Afritask and by email."
        : PERMISSION_TEXT[permission] ?? "";

  return (
    <div className="flex flex-col gap-3">
      <SettingSwitch
        icon={Volume2}
        title="Notification sound"
        description="A short chime for every notification while Afritask is open, even in a background tab."
        checked={preferences.soundEnabled}
        disabled={saving !== null}
        onChange={(checked) => run("sound", () => setSoundEnabled(checked), checked ? "Sound on." : "Sound off.")}
      >
        <button type="button" onClick={testChime} className="mt-2 ml-8 text-[13.5px] font-medium text-forest underline-offset-4 hover:underline">
          Play the sound
        </button>
      </SettingSwitch>
      <SettingSwitch
        icon={BellRing}
        title="Push notifications"
        description="Assignments, mentions, invitations and reminders on this device's notification centre, even when Afritask is closed."
        checked={preferences.pushEnabled}
        disabled={saving !== null || !preferences.pushAvailable}
        onChange={(checked) => run("push", () => setPushEnabled(checked), checked ? "Push is on for this browser." : "Push is off on all your devices.")}
      >
        {pushNote && <p className="mt-2 ml-8 text-[13.5px] text-muted">{pushNote}</p>}
      </SettingSwitch>
      {message && (
        <p aria-live="polite" className={cx("text-[14px]", message.tone === "saved" ? "text-done" : "text-brick")}>
          {message.text}
        </p>
      )}
    </div>
  );
}
