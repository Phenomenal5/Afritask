"use client";

// "Install Afritask" in Settings: a real install button where the browser offers one,
// honest instructions where it doesn't (iOS Safari), and a plain note when it's already
// installed. Installation is optional — nothing in Afritask depends on it.
import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, MonitorSmartphone, Share } from "lucide-react";
import Button from "@/components/ui/Button";
import { canPromptInstall, isIos, isStandalone, promptInstall, subscribeInstallPrompt } from "./installPrompt";

export default function InstallAppCard() {
  const installable = useSyncExternalStore(subscribeInstallPrompt, canPromptInstall, () => false);
  // Read after mount: these depend on the browser.
  const [platform, setPlatform] = useState<{ standalone: boolean; ios: boolean } | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    setPlatform({ standalone: isStandalone(), ios: isIos() });
  }, []);

  if (!platform) return null;

  let body;
  if (platform.standalone) {
    body = <p className="text-[14px] text-muted">You&apos;re using the installed app. It updates itself; you&apos;ll be asked to reload when a new version is ready.</p>;
  } else if (installable) {
    body = (
      <div className="flex flex-wrap items-center gap-3">
        <Button
          icon={<Download size={17} aria-hidden="true" />}
          onClick={async () => {
            const result = await promptInstall();
            setOutcome(result === "accepted" ? "Installed. You'll find Afritask with your other apps." : null);
          }}
        >
          Install Afritask
        </Button>
        {outcome && <p className="text-[14px] text-muted">{outcome}</p>}
      </div>
    );
  } else if (platform.ios) {
    body = (
      <p className="flex items-start gap-2 text-[14px] text-muted">
        <Share size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        In Safari, tap Share, then &ldquo;Add to Home Screen&rdquo;.
      </p>
    );
  } else {
    body = <p className="text-[14px] text-muted">Your browser hasn&apos;t offered installation here. In Chrome or Edge, look for the install icon in the address bar.</p>;
  }

  return (
    <div className="flex items-start gap-3">
      <MonitorSmartphone size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-forest" />
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[15px] font-medium text-ink">Install as an app</p>
        <p className="mb-3 text-[14px] text-muted">
          Optional. Opens Afritask in its own window from your home screen or dock. It still needs a connection, because changes aren&apos;t saved offline.
        </p>
        {body}
      </div>
    </div>
  );
}
