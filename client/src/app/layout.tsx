// Root layout: fonts, theme bootstrapping, shared providers and the toast region.
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import AppProviders from "@/context/AppProviders";
import { Toaster } from "react-hot-toast";
import ServiceWorkerManager from "@/components/pwa/ServiceWorkerManager";

// Fraunces carries the expressive marketing headings; DM Sans runs the product UI.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Afritask — A clear place for your next step",
  description:
    "Afritask keeps your plans, tasks and the people you work with in one shared workspace, so everyone knows what's next.",
  // The manifest is linked automatically from app/manifest.ts.
  applicationName: "Afritask",
  appleWebApp: { capable: true, title: "Afritask", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#163C2F" },
    { media: "(prefers-color-scheme: dark)", color: "#0C1611" },
  ],
};

// Runs before paint so the saved theme never flashes the wrong colours.
const THEME_BOOTSTRAP = `(function () {
  try {
    var stored = window.localStorage.getItem("afritask_theme");
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var root = document.documentElement;
    if (theme === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    root.style.colorScheme = theme;
  } catch (storageError) {}
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${dmSans.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <AppProviders>
          {children}
          <ServiceWorkerManager />
          {/* react-hot-toast renders each toast with role="status" + aria-live, so save
              results and errors are announced to screen readers. */}
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 4000,
              style: {
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                fontFamily: "var(--font-dm-sans)",
                fontSize: "15px",
                padding: "10px 14px",
                boxShadow: "var(--shadow-md)",
                maxWidth: "min(440px, calc(100vw - 32px))",
              },
              success: { iconTheme: { primary: "var(--status-done)", secondary: "var(--surface)" } },
              error: { duration: 6000, iconTheme: { primary: "var(--brick)", secondary: "var(--surface)" } },
            }}
          />
        </AppProviders>
      </body>
    </html>
  );
}
