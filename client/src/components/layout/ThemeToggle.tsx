"use client";

// Light/dark switch. The saved choice is applied before paint by the script in
// app/layout.tsx; this only flips it and remembers it per browser.
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cx } from "@/lib/cx";

const STORAGE_KEY = "afritask_theme";
const THEME_EVENT = "afritask:theme";

const readTheme = () => (document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");

const subscribe = (onChange: () => void) => {
  window.addEventListener(THEME_EVENT, onChange);
  return () => window.removeEventListener(THEME_EVENT, onChange);
};

// `compact`: icon only (navigation bars). The label stays available to screen readers and
// as a hover tooltip.
export default function ThemeToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light");
  const nextTheme = theme === "dark" ? "light" : "dark";

  const toggleTheme = () => {
    const root = document.documentElement;
    if (nextTheme === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    root.style.colorScheme = nextTheme;
    try {
      localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // Storage blocked: the theme still applies for this visit.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };

  const label = theme === "dark" ? "Use light theme" : "Use dark theme";
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      className={cx("flex cursor-pointer items-center gap-2.5", className)}
    >
      {theme === "dark" ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
      {!compact && label}
    </button>
  );
}
