"use client";

// Settings → Profile: turn the Afritask newsletter on or off. Saves as soon as it's
// switched (no separate Save button) and says so. Every newsletter email points here,
// next to its one-click unsubscribe link.
import { useEffect, useState } from "react";
import { Newspaper } from "lucide-react";
import { getMySubscription, updateMySubscription } from "@/lib/services/newsletterService";
import { failureMessage } from "@/lib/errors";
import { cx } from "@/lib/cx";

export default function NewsletterToggle() {
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ tone: "saved" | "failed"; text: string } | null>(null);

  useEffect(() => {
    getMySubscription()
      .then((res) => setSubscribed(res.data.data.subscribed))
      .catch(() => setStatus({ tone: "failed", text: "We couldn't load your newsletter setting. Refresh to try again." }));
  }, []);

  const handleChange = async (nextSubscribed: boolean) => {
    setSaving(true);
    setStatus(null);
    try {
      const res = await updateMySubscription(nextSubscribed);
      setSubscribed(res.data.data.subscribed);
      setStatus({ tone: "saved", text: res.data.message });
    } catch (error) {
      setStatus({ tone: "failed", text: failureMessage(error, "That didn't save. Try again.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-w-lg flex-col gap-2">
      <label className={cx("flex items-start gap-3 rounded-[12px] border border-line bg-surface p-4", subscribed !== null && !saving && "cursor-pointer")}>
        <Newspaper size={19} aria-hidden="true" className="mt-0.5 shrink-0 text-forest" />
        <span className="flex-1 text-[14.5px]">
          <span className="block font-semibold text-ink">Afritask newsletter</span>
          <span className="mt-0.5 block text-muted">Product news and tips, now and then. Also in the News feed in the app. Unsubscribe any time — here, or with the link in any newsletter email.</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={!!subscribed}
          disabled={subscribed === null || saving}
          onChange={(event) => handleChange(event.target.checked)}
          aria-label="Receive the Afritask newsletter"
          className="mt-1 size-[20px] shrink-0 accent-[var(--forest)]"
        />
      </label>
      {status && (
        <p aria-live="polite" className={cx("text-[14px]", status.tone === "saved" ? "text-done" : "text-brick")}>
          {status.text}
        </p>
      )}
    </div>
  );
}
