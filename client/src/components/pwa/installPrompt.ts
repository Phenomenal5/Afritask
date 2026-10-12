"use client";

// Keeps the browser's install prompt (Chromium's `beforeinstallprompt`) so Settings can
// offer an "Install Afritask" button later. The event fires once, early, so it's captured
// app-wide by ServiceWorkerManager and shared through this tiny store.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());
let captured = false;

export function capturePwaInstallPrompt() {
  if (captured || typeof window === "undefined") return;
  captured = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    // Hold the prompt for our own button instead of the browser's mini-infobar.
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

export const canPromptInstall = () => deferredPrompt !== null;

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferredPrompt) return "unavailable";
  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  await promptEvent.prompt();
  const { outcome } = await promptEvent.userChoice;
  notify();
  return outcome;
}

export function subscribeInstallPrompt(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Already running as an installed app?
export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

// The overview's install popup, once closed, stays closed until the next sign-in.
export const INSTALL_PROMPT_DISMISSED_KEY = "afritask:install-prompt-dismissed";

export const wasInstallPromptDismissed = () => {
  try {
    return sessionStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
};

export const rememberInstallPromptDismissed = () => {
  try {
    sessionStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, "1");
  } catch {
    // Storage blocked: it closes now and may show again on the next visit to the overview.
  }
};

// Called on sign-out, so the next sign-in offers installation again.
export const clearInstallPromptDismissed = () => {
  try {
    sessionStorage.removeItem(INSTALL_PROMPT_DISMISSED_KEY);
  } catch {
    // Nothing to clear.
  }
};
