"use client";

// Connection state, said plainly. Afritask doesn't queue offline changes (PRD FR15), so
// the banner promises nothing about syncing later — it says what does and doesn't work.
import { useEffect, useRef, useState } from "react";
import { CloudOff, Wifi } from "lucide-react";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";

export default function OfflineBanner() {
  const online = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOfflineRef = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOfflineRef.current = true;
      setShowReconnected(false);
      return;
    }
    if (!wasOfflineRef.current) return;
    wasOfflineRef.current = false;
    setShowReconnected(true);
    const timer = window.setTimeout(() => setShowReconnected(false), 4000);
    return () => window.clearTimeout(timer);
  }, [online]);

  return (
    <div role="status" aria-live="polite">
      {!online && (
        <div className="flex items-start gap-3 border-b border-harvest/60 bg-harvest-tint px-4 py-2.5 text-[14px] text-ink sm:px-8">
          <CloudOff size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          <p>
            <strong>You&apos;re offline.</strong> You can keep reading what&apos;s on screen, but changes can&apos;t be saved and
            won&apos;t be sent later. Reconnect, then try again.
          </p>
        </div>
      )}
      {showReconnected && (
        <div className="flex items-center gap-3 border-b border-lime-deep bg-lime px-4 py-2 text-[14px] text-forest-deep sm:px-8">
          <Wifi size={18} aria-hidden="true" />
          Back online. You can save changes again.
        </div>
      )}
    </div>
  );
}
