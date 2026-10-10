// AuthLayout frames sign-in, sign-up, recovery, verification, invitations and onboarding:
// a forest story panel on wide screens (what Afritask is for) and a calm form column.
import type { ReactNode } from "react";
import Link from "next/link";
import Logo from "@/components/ui/Logo";

const currentYear = new Date().getFullYear();

interface AuthLayoutProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  // Below-the-form links ("Already have an account? Sign in").
  footer?: ReactNode;
  // Replaces the default story on the left (e.g. invitation details).
  aside?: ReactNode;
}

function StoryPanel() {
  return (
    <div className="relative flex flex-1 flex-col justify-center">
      <p className="font-display text-[40px] font-semibold leading-[1.1] tracking-tight text-sidebar-text xl:text-[46px]">
        A clear place for your <em className="font-medium text-lime">next step.</em>
      </p>
      <p className="mt-5 max-w-sm text-[16px] leading-relaxed text-sidebar-muted">
        Big plans. Small tasks. People to bring along. Keep them together, and move forward with a little more clarity.
      </p>

      {/* Plan → people → progress, joined by one path. Decorative. */}
      <svg aria-hidden="true" viewBox="0 0 360 170" className="mt-12 w-full max-w-[380px]">
        <path d="M24 140 C 90 140, 100 70, 170 74 S 270 36, 330 30" fill="none" stroke="var(--lime)" strokeOpacity="0.55" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="1 9" />
        <g>
          <rect x="4" y="118" width="44" height="44" rx="11" fill="var(--forest-soft)" stroke="var(--lime)" strokeOpacity="0.35" />
          <path d="M16 132h20M16 140h14M16 148h17" stroke="var(--lime)" strokeWidth="2.4" strokeLinecap="round" />
        </g>
        <g>
          <circle cx="160" cy="76" r="15" fill="var(--harvest)" />
          <circle cx="184" cy="76" r="15" fill="var(--lime)" stroke="var(--forest)" strokeWidth="3" />
        </g>
        <g>
          <circle cx="330" cy="30" r="21" fill="var(--lime)" />
          <path d="M320 30l7 7 13-14" fill="none" stroke="var(--forest)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>
        <text x="4" y="112" fill="var(--sidebar-muted)" fontSize="12" fontFamily="var(--font-dm-sans)">Plan</text>
        <text x="146" y="110" fill="var(--sidebar-muted)" fontSize="12" fontFamily="var(--font-dm-sans)">People</text>
        <text x="300" y="72" fill="var(--sidebar-muted)" fontSize="12" fontFamily="var(--font-dm-sans)">Progress</text>
      </svg>
    </div>
  );
}

export default function AuthLayout({ eyebrow, title, description, children, footer, aside }: AuthLayoutProps) {
  return (
    <div className="grid min-h-dvh bg-page lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="on-forest relative hidden flex-col overflow-hidden bg-sidebar p-12 lg:flex">
        <Link href="/" className="inline-flex self-start rounded-[8px]">
          <Logo onDark />
        </Link>
        {aside ?? <StoryPanel />}
        <p className="text-[13px] text-sidebar-muted">
          &copy; {currentYear} Afritask ·{" "}
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            Privacy policy
          </Link>
        </p>
      </aside>

      <main id="main-content" className="flex flex-col px-4 py-8 sm:px-10 lg:justify-center lg:px-16">
        <Link href="/" className="mb-10 inline-flex self-start rounded-[8px] lg:hidden">
          <Logo />
        </Link>
        <div className="w-full max-w-[440px] lg:mx-auto">
          {eyebrow && <div className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-forest">{eyebrow}</div>}
          <h1 className="font-display text-[32px] font-semibold leading-tight tracking-tight text-ink sm:text-[36px]">{title}</h1>
          {description && <div className="mt-2.5 text-[15.5px] leading-relaxed text-muted">{description}</div>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-8 text-center text-[15px] text-muted">{footer}</div>}
        </div>
        <p className="mt-12 text-center text-[13px] text-muted lg:hidden">
          &copy; {currentYear} Afritask ·{" "}
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            Privacy policy
          </Link>
        </p>
      </main>
    </div>
  );
}
