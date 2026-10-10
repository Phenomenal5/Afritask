"use client";

// Registers the service worker (production builds only — in development it would cache
// stale bundles) and offers a "new version" prompt instead of swapping code under someone
// mid-edit. Reloading with unsaved task edits still triggers the browser's "leave page?"
// warning from the task drawer, and the task composer and comments keep their drafts.
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import Button from "@/components/ui/Button";
import { capturePwaInstallPrompt } from "./installPrompt";

export default function ServiceWorkerManager() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    capturePwaInstallPrompt();
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    let cancelled = false;
    const watchForUpdate = (registration: ServiceWorkerRegistration) => {
      // Only an UPDATE needs a prompt: the very first install has nothing to replace.
      if (registration.waiting && navigator.serviceWorker.controller) setWaitingWorker(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        installing?.addEventListener("statechange", () => {
          if (!cancelled && installing.state === "installed" && navigator.serviceWorker.controller) setWaitingWorker(installing);
        });
      });
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(watchForUpdate)
      .catch(() => {
        // No service worker (private mode, unsupported): the app works the same, just not installable.
      });

    // Once the new worker takes over, load the new version.
    const reloadOnTakeover = () => window.location.reload();
    navigator.serviceWorker.addEventListener("controllerchange", reloadOnTakeover);
    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", reloadOnTakeover);
    };
  }, []);

  if (!waitingWorker) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md flex-wrap items-center gap-3 rounded-[14px] border border-line bg-surface p-4 shadow-lg sm:inset-x-auto sm:right-6"
    >
      <RefreshCw size={20} aria-hidden="true" className="shrink-0 text-forest" />
      <p className="min-w-0 flex-1 text-[14px] text-ink">
        <strong>A new version of Afritask is ready.</strong> Save anything you&apos;re editing, then reload.
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => setWaitingWorker(null)}>
          Later
        </Button>
        <Button
          size="sm"
          loading={reloading}
          onClick={() => {
            setReloading(true);
            waitingWorker.postMessage({ type: "SKIP_WAITING" });
          }}
        >
          Reload
        </Button>
      </div>
    </div>
  );
}
