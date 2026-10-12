// Cookie Policy: public, linked from the footer of every public page and from the Privacy
// Policy. Every entry below is something the app really stores.
// NOTE: when you add a cookie, a localStorage/sessionStorage key or a cache, list it here
// and update LAST_UPDATED. Today it's: the two sign-in cookies (server/src/services/
// sessionService.ts), the keys in ThemeToggle, WorkspaceContext, pendingInvite,
// PushPermissionBanner, GoogleButton and draftStorage, and the service worker cache (public/sw.js).
import type { ReactNode } from "react";
import Link from "next/link";
import { PublicFooter, PublicHeader } from "@/components/legal/PublicFrame";

export const metadata = {
  title: "Cookie Policy - Afritask",
  description: "The cookies and browser storage Afritask uses, what each one is for, and how to clear them.",
};

const LAST_UPDATED = "October 12, 2026";

const PROSE_CLASSES = [
  "flex flex-col gap-3 text-[15px] leading-7",
  "[&_strong]:font-semibold [&_strong]:text-[var(--ink)]",
  "[&_a]:font-medium [&_a]:text-[var(--moss)] [&_a]:underline [&_a]:underline-offset-2",
  "[&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:bg-[var(--line-soft)] [&_code]:text-[var(--ink)]",
].join(" ");

interface StoredItem {
  name: string;
  purpose: string;
  lasts: string;
}

const COOKIES: StoredItem[] = [
  { name: "afritask_access", purpose: "Proves you're signed in on each request.", lasts: "15 minutes, renewed while you use the app" },
  { name: "afritask_refresh", purpose: "Keeps you signed in between visits. Only sent when signing in or renewing.", lasts: "7 days, or until you sign out" },
];

const LOCAL_STORAGE: StoredItem[] = [
  { name: "afritask_theme", purpose: "Remembers light or dark mode.", lasts: "Until you clear it" },
  { name: "afritask_active_workspace", purpose: "Opens the workspace you used last.", lasts: "Until you sign out or clear it" },
  { name: "afritask_pending_invite", purpose: "Holds an invitation link while you sign up, so you can accept it after confirming your email.", lasts: "Until you answer the invitation or sign out" },
];

const SESSION_STORAGE: StoredItem[] = [
  { name: "afritask_return_path", purpose: "Takes you back to the page you were on after signing in.", lasts: "This tab only" },
  { name: "afritask_task_draft, afritask:comment-draft", purpose: "Keeps a task or comment you were writing if a save fails or you close it by accident.", lasts: "This tab only" },
  { name: "afritask:push-banner-dismissed", purpose: "Hides the notification prompt after you close it.", lasts: "This tab only" },
  { name: "afritask:terms-accepted-before-google", purpose: "Remembers that you accepted the terms before continuing with Google.", lasts: "This tab only" },
];

function Section({ number, title, children }: { number: number; title: string; children: ReactNode }) {
  return (
    <section className="pt-10">
      <h2 className="font-display text-xl mb-3" style={{ color: "var(--ink)" }}>
        <span style={{ color: "var(--moss)" }}>{number}.</span> {title}
      </h2>
      <div className={PROSE_CLASSES} style={{ color: "var(--ink-soft)" }}>
        {children}
      </div>
    </section>
  );
}

// A table on wide screens, stacked rows on phones (no sideways scrolling).
function StoredItemsTable({ caption, items }: { caption: string; items: StoredItem[] }) {
  return (
    <table className="w-full text-left text-[14px] leading-6">
      <caption className="sr-only">{caption}</caption>
      <thead className="hidden sm:table-header-group">
        <tr className="border-b border-line text-[13px] text-muted">
          <th scope="col" className="py-2 pr-4 font-medium">Name</th>
          <th scope="col" className="py-2 pr-4 font-medium">What it&apos;s for</th>
          <th scope="col" className="py-2 font-medium">How long</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.name} className="flex flex-col gap-1 border-b border-line-soft py-3 sm:table-row sm:py-0">
            <th scope="row" className="font-normal sm:py-3 sm:pr-4 sm:align-top">
              <code className="break-all">{item.name}</code>
            </th>
            <td className="sm:py-3 sm:pr-4 sm:align-top">{item.purpose}</td>
            <td className="text-muted sm:py-3 sm:align-top">{item.lasts}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CookiesPage() {
  return (
    <div className="flex-1 flex flex-col">
      <PublicHeader />

      <main className="relative max-w-2xl w-full mx-auto px-6 py-12 flex-1">
        <p className="text-xs font-medium tracking-wide uppercase mb-2" style={{ color: "var(--moss)" }}>
          Legal
        </p>
        <h1 className="font-display text-4xl mb-2" style={{ color: "var(--ink)" }}>
          Cookie Policy
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
          Last updated {LAST_UPDATED}
        </p>

        <p className="text-[15px] leading-7" style={{ color: "var(--ink-soft)" }}>
          Afritask keeps a few small things in your browser so you stay signed in and the app
          remembers your choices. This page lists every one of them. There are no analytics,
          advertising or tracking cookies, and nothing here is shared with anyone else.
        </p>

        <Section number={1} title="Cookies">
          <p>
            Afritask sets two cookies, both needed for signing in. Scripts on the page can&apos;t
            read them, and they&apos;re only sent to Afritask over a secure connection. Because the
            app can&apos;t work without them, we don&apos;t ask for consent first.
          </p>
          <StoredItemsTable caption="Cookies Afritask sets" items={COOKIES} />
        </Section>

        <Section number={2} title="Local storage">
          <p>Small settings saved on this device. They hold no task content.</p>
          <StoredItemsTable caption="What Afritask keeps in local storage" items={LOCAL_STORAGE} />
        </Section>

        <Section number={3} title="Session storage">
          <p>Kept only while the tab is open, and gone when you close it.</p>
          <StoredItemsTable caption="What Afritask keeps in session storage" items={SESSION_STORAGE} />
        </Section>

        <Section number={4} title="Offline files">
          <p>
            If your browser supports it, Afritask saves its own files (the app&apos;s code, icons,
            the notification sound and a page to show when you&apos;re offline) so it loads quickly.
            Your tasks, comments and account details are never saved this way. They always come
            fresh from Afritask.
          </p>
        </Section>

        <Section number={5} title="Signing in with Google">
          <p>
            If you choose to continue with Google, that step happens on Google&apos;s own pages, and
            Google&apos;s cookies apply there. See{" "}
            <a href="https://policies.google.com/technologies/cookies" target="_blank" rel="noreferrer">
              how Google uses cookies
            </a>
            .
          </p>
        </Section>

        <Section number={6} title="Clearing them">
          <p>
            Signing out removes the sign-in cookies. You can also clear everything for this site in
            your browser&apos;s settings, usually under Privacy or Site data. Afritask will still work
            afterwards: you&apos;ll just need to sign in again and pick your theme.
          </p>
          <p>
            Questions? Write to us from the <Link href="/contact">Contact page</Link>, or read the{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </Section>
      </main>

      <PublicFooter />
    </div>
  );
}
