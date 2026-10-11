"use client";

// The theme's colours as real values, for libraries that draw SVG attributes (charts) —
// an SVG fill="var(--forest)" attribute doesn't resolve CSS variables. Re-reads when the
// theme switches (html[data-theme]).
import { useEffect, useState } from "react";

const TOKENS = ["forest", "lime-deep", "harvest", "brick", "text", "text-muted", "border", "surface"] as const;
export type ThemeColors = Record<(typeof TOKENS)[number], string> & { mode: "light" | "dark" };

// Light-theme values, used for the server render and until the browser has read them.
const FALLBACK: ThemeColors = {
  forest: "#163c2f",
  "lime-deep": "#cfe08a",
  harvest: "#f3c863",
  brick: "#a32e35",
  text: "#253c32",
  "text-muted": "#626e63",
  border: "#dfe4d8",
  surface: "#ffffff",
  mode: "light",
};

const readColors = (): ThemeColors => {
  const styles = getComputedStyle(document.documentElement);
  const tokens = Object.fromEntries(TOKENS.map((token) => [token, styles.getPropertyValue(`--${token}`).trim() || FALLBACK[token]]));
  // Chart palettes have separate light and dark steps; the theme toggle sets data-theme.
  const mode = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  return { ...tokens, mode } as ThemeColors;
};

export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(FALLBACK);
  useEffect(() => {
    setColors(readColors());
    const observer = new MutationObserver(() => setColors(readColors()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => observer.disconnect();
  }, []);
  return colors;
}
