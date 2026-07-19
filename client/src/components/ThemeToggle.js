"use client";

// ThemeToggle persists the user's appearance preference and flips the document theme.
const STORAGE_KEY = "afritask_theme";

// Read the current theme from the root element so the toggle always flips the active mode.
function getCurrentTheme() {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

// Apply a theme to the document root so CSS variables and color-scheme update together.
function applyTheme(theme) {
  const root = document.documentElement;

  if (theme === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }

  root.style.colorScheme = theme;
}

export default function ThemeToggle() {
  const toggleTheme = () => {
    const nextTheme = getCurrentTheme() === "dark" ? "light" : "dark";
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
    applyTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle inline-flex h-9 w-9 items-center justify-center rounded-full cursor-pointer transition-colors hover:bg-[var(--line-soft)]"
      style={{
        background: "var(--paper-raised)",
        color: "var(--ink)",
        border: "1px solid var(--line)",
      }}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      <span className="theme-toggle-moon inline-flex">
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <path
            d="M13.5 11.5a6.5 6.5 0 1 1-7-8 5.5 5.5 0 0 0 7 8Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="theme-toggle-sun inline-flex">
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="9" cy="9" r="3.2" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M9 1.8v1.9M9 14.3v1.9M1.8 9h1.9M14.3 9h1.9M4.2 4.2l1.3 1.3M12.5 12.5l1.3 1.3M13.8 4.2l-1.3 1.3M5.5 12.5l-1.3 1.3"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        </svg>
      </span>
    </button>
  );
}
