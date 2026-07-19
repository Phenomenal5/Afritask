// Root layout wires global fonts, theme bootstrapping, and the shared app providers.
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import AppProviders from "@/context/AppProviders";
import { Toaster } from "react-hot-toast";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata = {
  title: "Afritask - Warm task management for African teams",
  description:
    "Afritask is a task management app built for African professionals and teams to plan, track, and finish work with clarity.",
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function () {
  try {
    var key = "afritask_theme";
    var stored = window.localStorage.getItem(key);
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    var root = document.documentElement;
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }
    root.style.colorScheme = theme;
  } catch (e) {}
})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col paper-grain" suppressHydrationWarning>
        <AppProviders>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: {
                background: "var(--paper-raised)",
                color: "var(--ink)",
                border: "1px solid var(--line)",
                borderRadius: "10px",
                fontFamily: "var(--font-inter)",
                fontSize: "14px",
                boxShadow: "0 4px 16px color-mix(in srgb, var(--ink) 10%, transparent)",
              },
              success: {
                iconTheme: { primary: "var(--success)", secondary: "var(--paper-raised)" },
              },
              error: {
                iconTheme: { primary: "var(--error)", secondary: "var(--paper-raised)" },
              },
            }}
          />
        </AppProviders>
      </body>
    </html>
  );
}
