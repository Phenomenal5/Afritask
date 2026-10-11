// Terms of Service — public, so people can read them before signing up (the signup
// checkbox and the accept-terms step link here).
// NOTE: when these change in a way people must agree to again, update LAST_UPDATED AND
// bump CURRENT_TERMS_VERSION in server/src/config/terms.ts — that's what asks everyone to
// accept again. Have the wording reviewed by someone qualified before relying on it.
import type { ReactNode } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/layout/ThemeToggle";
import Logo from "@/components/ui/Logo";

export const metadata = {
  title: "Terms of Service - Afritask",
  description: "The rules for using Afritask: your account, your content, workspaces, and what you can expect from us.",
};

const LAST_UPDATED = "October 11, 2026";

const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

const PROSE_CLASSES = [
  "flex flex-col gap-3 text-[15px] leading-7",
  "[&_strong]:font-semibold [&_strong]:text-[var(--ink)]",
  "[&_a]:font-medium [&_a]:text-[var(--moss)] [&_a]:underline [&_a]:underline-offset-2",
  "[&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5 [&_ul]:list-disc [&_li]:marker:text-[var(--moss)]",
].join(" ");

// ─── Layout helpers ─────────────────────────────────

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

// ─── Page ───────────────────────────────────────────

export default function TermsPage() {
  return (
    <div className="flex-1 flex flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-page/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link href="/" className="rounded-[8px]" aria-label="Afritask home">
            <Logo />
          </Link>
          <ThemeToggle className="h-11 rounded-[10px] px-3 text-[14px] text-muted hover:bg-surface-muted hover:text-ink" />
        </div>
      </header>

      <main className="relative max-w-2xl w-full mx-auto px-6 py-12 flex-1">
        <p className="text-xs font-medium tracking-wide uppercase mb-2" style={{ color: "var(--moss)" }}>
          Legal
        </p>
        <h1 className="font-display text-4xl mb-2" style={{ color: "var(--ink)" }}>
          Terms of Service
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
          Last updated {LAST_UPDATED}
        </p>
        <p className="text-[15px] leading-7" style={{ color: "var(--ink-soft)" }}>
          These terms are the agreement between you and Afritask when you create an account or use the app. Please read them with our{" "}
          <Link href="/privacy" className="font-medium underline underline-offset-2" style={{ color: "var(--moss)" }}>
            Privacy Policy
          </Link>
          , which explains how we handle your data.
        </p>

        <Section number={1} title="Your account">
          <ul>
            <li>Give accurate details and keep your password to yourself. You&apos;re responsible for what happens under your account.</li>
            <li>Tell us straight away if you think someone else has accessed it.</li>
            <li>One person per account. Accounts may not be shared or sold.</li>
          </ul>
        </Section>

        <Section number={2} title="Your content">
          <p>
            Tasks, projects, comments and files you add stay <strong>yours</strong>. You give Afritask permission to store, process and show them only so the app can work for you and the people you share a workspace with.
          </p>
          <p>Don&apos;t add anything you don&apos;t have the right to share, or anything illegal, hateful or harmful.</p>
        </Section>

        <Section number={3} title="Workspaces and teammates">
          <p>
            A workspace&apos;s owner and admins decide who joins it and what they can do. Anything you post in a shared workspace is visible to its members. When you leave or are removed, what you contributed stays with the workspace.
          </p>
        </Section>

        <Section number={4} title="Acceptable use">
          <ul>
            <li>No attempts to break, overload, or get around the security of the service.</li>
            <li>No spam — including through invitations — and no automated scraping.</li>
            <li>No using Afritask to harass anyone or break the law.</li>
          </ul>
          <p>We may suspend an account or workspace that breaks these rules, and we&apos;ll tell you why.</p>
        </Section>

        <Section number={5} title="Emails from us">
          <p>
            We send emails the service needs — verification, password resets, invitations, reminders. Newsletters are separate and optional: you can opt out at any time from your profile settings or with the link in every newsletter.
          </p>
        </Section>

        <Section number={6} title="Availability and changes">
          <p>
            We work hard to keep Afritask running and your data safe, but the service is provided &quot;as is&quot;, without guarantees that it will always be available or error-free. We may change or retire features. If we change these terms in a way that matters, we&apos;ll ask you to accept them again before you continue.
          </p>
        </Section>

        <Section number={7} title="Closing your account">
          <p>
            You can stop using Afritask at any time and ask us to delete your account. Workspaces you own with other members may need a new owner first, so the team doesn&apos;t lose its work.
          </p>
        </Section>

        <Section number={8} title="Contact">
          <p>
            Questions about these terms?{" "}
            {CONTACT_EMAIL ? (
              <>
                Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
              </>
            ) : (
              <>Reply to any email you&apos;ve received from Afritask.</>
            )}
          </p>
        </Section>
      </main>
    </div>
  );
}
