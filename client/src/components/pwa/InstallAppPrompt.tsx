"use client";

// Offers to install Afritask as an app right after sign-in, on the overview. Shown only
// where it can work: the browser has offered installation (Chrome, Edge, Android), or it's
// iOS Safari (which can't be prompted, so it explains the two taps). Never when Afritask
// is already running as the installed app.
// Closing it (the X or "Not now") hides it until the next sign-in: the dismissal lives in
// sessionStorage and AuthContext clears it on sign-out. Installing stays available in
// Settings at any time.
import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, SquarePlus } from "lucide-react";
import toast from "react-hot-toast";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import {
  canPromptInstall,
  isIos,
  isStandalone,
  promptInstall,
  rememberInstallPromptDismissed,
  subscribeInstallPrompt,
  wasInstallPromptDismissed,
} from "./installPrompt";

export default function InstallAppPrompt() {
  // The browser's prompt can arrive a moment after the page loads; this re-renders when it does.
  const installable = useSyncExternalStore(subscribeInstallPrompt, canPromptInstall, () => false);
  // Read after mount: these depend on the browser.
  const [context, setContext] = useState<{ standalone: boolean; ios: boolean; dismissed: boolean } | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    setContext({ standalone: isStandalone(), ios: isIos(), dismissed: wasInstallPromptDismissed() });
  }, []);

  const dismiss = () => {
    rememberInstallPromptDismissed();
    setContext((current) => (current ? { ...current, dismissed: true } : current));
  };

  const install = async () => {
    setInstalling(true);
    const outcome = await promptInstall();
    setInstalling(false);
    if (outcome === "accepted") toast.success("Afritask is installed. You'll find it with your other apps.");
    // Whatever they chose in the browser's own prompt, this one has done its job.
    dismiss();
  };

  const open = !!context && !context.standalone && !context.dismissed && (installable || context.ios);
  if (!open) return null;

  const iosSteps = !installable && context.ios;

  return (
    <Dialog
      open
      onClose={dismiss}
      size="sm"
      title="Install Afritask"
      description="Open it from your home screen or dock, in its own window, like any other app."
      footer={
        iosSteps ? (
          <Button onClick={dismiss}>Got it</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={dismiss} disabled={installing}>
              Not now
            </Button>
            <Button icon={<Download size={17} aria-hidden="true" />} loading={installing} onClick={install}>
              Install
            </Button>
          </>
        )
      }
    >
      {iosSteps ? (
        <ol className="flex flex-col gap-3 text-[15px] leading-relaxed text-ink">
          <li className="flex items-start gap-3">
            <Share size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-forest" />
            <span>In Safari, tap the Share button.</span>
          </li>
          <li className="flex items-start gap-3">
            <SquarePlus size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-forest" />
            <span>Choose &ldquo;Add to Home Screen&rdquo;.</span>
          </li>
        </ol>
      ) : (
        <p className="text-[15px] leading-relaxed text-muted">
          It&apos;s optional and takes a second. You can also install it later from Settings. Afritask still needs a connection, because changes
          aren&apos;t saved offline.
        </p>
      )}
    </Dialog>
  );
}
