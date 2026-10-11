// Landing page: the Afritask story — what it's for, how it's organised, and how to start.
// A server component (static, indexable); only the header's session-aware actions run on
// the client. Everything described here is a feature that exists today.
import type { Metadata } from "next";
import type { CSSProperties } from "react";
import Link from "next/link";
import LandingMotion from "@/components/landing/LandingMotion";
import NewsletterSignupForm from "@/components/newsletter/NewsletterSignupForm";
import {
  ArrowRight,
  BellRing,
  Circle,
  CircleCheck,
  CircleDot,
  CircleEllipsis,
  Compass,
  Footprints,
  History,
  LayoutList,
  ListTree,
  MailPlus,
  SquareKanban,
  UserCheck,
  Users,
} from "lucide-react";
import Logo from "@/components/ui/Logo";
import { ButtonLink } from "@/components/ui/Button";
import LandingNavActions from "@/components/marketing/LandingNavActions";
import { PathIllustration, StructureIllustration } from "@/components/marketing/Illustrations";

export const metadata: Metadata = {
  title: "Afritask: a clear place for your next step",
  description: "Afritask keeps your workspaces, projects and tasks in one place, so you and the people you work with know what's next.",
};

const PRINCIPLES = [
  {
    icon: Compass,
    title: "A shared direction",
    body: "A workspace holds the plan and the people working on it. Everyone in it sees every project, so nobody works from an old copy.",
  },
  {
    icon: UserCheck,
    title: "Clear responsibility",
    body: "Each task has one owner, or says plainly that it's Unassigned. Big tasks split into subtasks, each with its own owner.",
  },
  {
    icon: Footprints,
    title: "A small next step",
    body: "Only a title is needed to write a task down. Your overview picks the one thing that needs you most, and says why.",
  },
  {
    icon: CircleCheck,
    title: "Visible progress",
    body: "Four plain statuses, project progress you can see at a glance, and a history of every change showing who made it and when.",
  },
];

const STATUSES = [
  { icon: Circle, label: "Todo", color: "var(--status-todo)", tint: "var(--status-todo-tint)" },
  { icon: CircleDot, label: "In Progress", color: "var(--status-progress)", tint: "var(--status-progress-tint)" },
  { icon: CircleEllipsis, label: "In Review", color: "var(--status-review)", tint: "var(--status-review-tint)" },
  { icon: CircleCheck, label: "Completed", color: "var(--status-done)", tint: "var(--status-done-tint)" },
];

const SECTION = "mx-auto w-full max-w-[1160px] px-4 sm:px-8";

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-page">
      <LandingMotion />
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <header className="landing-header sticky top-0 z-30 border-b border-line/70 bg-page/90 backdrop-blur">
        <div className={`${SECTION} flex h-[72px] items-center justify-between gap-4`}>
          <Link href="/" className="rounded-[8px]" aria-label="Afritask home">
            <Logo />
          </Link>
          <nav aria-label="On this page" className="hidden items-center gap-1 md:flex">
            {[
              { href: "#how-it-works", label: "How it works" },
              { href: "#ownership", label: "Ownership" },
              { href: "#progress", label: "Progress" },
              { href: "#get-started", label: "Get started" },
            ].map((item) => (
              <a key={item.href} href={item.href} className="inline-flex h-11 items-center rounded-[10px] px-3 text-[15px] text-muted hover:bg-surface-muted hover:text-ink">
                {item.label}
              </a>
            ))}
          </nav>
          <LandingNavActions />
        </div>
      </header>

      <main id="main-content">
        {/* ─── Hero ───────────────────── */}
        <section className={`${SECTION} grid items-center gap-10 pb-16 pt-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:pb-24 lg:pt-20`}>
          <div>
            <p className="hero-rise mb-5 inline-flex items-center gap-2 rounded-full border border-lime-deep bg-lime px-3.5 py-1 text-[14px] font-medium text-forest-deep">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-forest" />
              Workspaces, projects and tasks for you and your team
            </p>
            <h1 className="hero-rise font-display text-[44px] font-semibold leading-[1.02] tracking-tight text-ink sm:text-[60px] lg:text-[68px]" style={{ "--rise-delay": "80ms" } as CSSProperties}>
              A clear place for your <em className="font-medium text-forest">next step.</em>
            </h1>
            <p className="hero-rise mt-6 max-w-[34rem] text-[18px] leading-relaxed text-muted sm:text-[19px]" style={{ "--rise-delay": "160ms" } as CSSProperties}>
              Break big plans into small tasks and bring in the people who can help. Keeping it all in one place makes the next step easier to see.
            </p>
            <div className="hero-rise mt-8 flex flex-col gap-3 sm:flex-row" style={{ "--rise-delay": "240ms" } as CSSProperties}>
              <ButtonLink href="/signup" size="lg" icon={<ArrowRight size={18} aria-hidden="true" />} className="flex-row-reverse">
                Get started
              </ButtonLink>
              <ButtonLink href="#how-it-works" size="lg" variant="secondary">
                See how it works
              </ButtonLink>
            </div>
            <p className="hero-rise mt-4 text-[14px] text-muted" style={{ "--rise-delay": "300ms" } as CSSProperties}>
              Works for one person. Grows when you invite others.
            </p>
          </div>
          <PathIllustration className="hero-rise mx-auto w-full max-w-[560px]" />
        </section>

        {/* ─── How it's organised ───────────────────── */}
        <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-20 border-y border-line bg-surface py-16 lg:py-24">
          <div className={`${SECTION} grid items-center gap-12 lg:grid-cols-2`}>
            <StructureIllustration className="order-2 w-full lg:order-1" />
            <div className="order-1 lg:order-2" data-reveal>
              <p className="text-[14px] font-semibold uppercase tracking-[0.1em] text-forest">How it works</p>
              <h2 id="how-heading" className="mt-3 font-display text-[36px] font-semibold leading-tight tracking-tight text-ink sm:text-[44px]">
                Three layers, each with one job.
              </h2>
              <dl className="mt-8 flex flex-col gap-6">
                <div className="border-l-[3px] border-forest pl-5">
                  <dt className="text-[18px] font-semibold text-ink">Workspace</dt>
                  <dd className="mt-1 text-[16px] leading-relaxed text-muted">
                    Your shared space, with its own people, projects and tasks. Keep a personal one and a team one side by side; they never mix.
                  </dd>
                </div>
                <div className="border-l-[3px] border-harvest pl-5">
                  <dt className="text-[18px] font-semibold text-ink">Projects</dt>
                  <dd className="mt-1 text-[16px] leading-relaxed text-muted">
                    Group related work, like a launch, a client or a course, and see how far along it is. Optional: tasks can live in the workspace on their own.
                  </dd>
                </div>
                <div className="border-l-[3px] border-lime-deep pl-5">
                  <dt className="text-[18px] font-semibold text-ink">Tasks</dt>
                  <dd className="mt-1 text-[16px] leading-relaxed text-muted">
                    One clear step, with an owner, a status, a priority and, if it matters, a due date. Break bigger ones into subtasks.
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* ─── Principles ───────────────────── */}
        <section aria-labelledby="principles-heading" className={`${SECTION} py-16 lg:py-24`}>
          <div className="max-w-2xl" data-reveal>
            <h2 id="principles-heading" className="font-display text-[36px] font-semibold leading-tight tracking-tight text-ink sm:text-[44px]">
              What Afritask keeps clear
            </h2>
            <p className="mt-3 text-[17px] leading-relaxed text-muted">Four ideas shape every screen.</p>
          </div>
          <ol className="relative mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2" data-reveal-stagger>
            {PRINCIPLES.map(({ icon: Icon, title, body }, index) => (
              <li key={title} className="flex gap-5">
                <span className="font-display text-[56px] font-semibold leading-none text-lime-deep" aria-hidden="true">
                  {index + 1}
                </span>
                <div className="pt-2">
                  <h3 className="flex items-center gap-2.5 text-[20px] font-semibold text-ink">
                    <Icon size={21} aria-hidden="true" className="text-forest" />
                    <span>
                      <span className="sr-only">{index + 1}. </span>
                      {title}
                    </span>
                  </h3>
                  <p className="mt-2 text-[16px] leading-relaxed text-muted">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ─── Ownership ───────────────────── */}
        <section id="ownership" aria-labelledby="ownership-heading" className="scroll-mt-20 bg-forest py-16 text-on-forest lg:py-24">
          <div className={`${SECTION} grid items-center gap-12 lg:grid-cols-2`}>
            <div>
              <p className="text-[14px] font-semibold uppercase tracking-[0.1em] text-lime">Ownership</p>
              <h2 data-reveal id="ownership-heading" className="mt-3 font-display text-[36px] font-semibold leading-tight tracking-tight sm:text-[44px]">
                Every task has a name next to it.
              </h2>
              <p className="mt-4 max-w-lg text-[17px] leading-relaxed text-on-forest/80">
                When several people share work, &ldquo;someone will do it&rdquo; becomes nobody. Afritask gives each task exactly one owner, and shows
                &ldquo;Unassigned&rdquo; out loud when there isn&apos;t one yet.
              </p>
              <ul className="mt-8 flex flex-col gap-4 text-[16px]" data-reveal-stagger>
                <li className="flex gap-3">
                  <ListTree size={21} aria-hidden="true" className="mt-0.5 shrink-0 text-lime" />
                  <span>Split big work into subtasks. Each one can have a different owner.</span>
                </li>
                <li className="flex gap-3">
                  <UserCheck size={21} aria-hidden="true" className="mt-0.5 shrink-0 text-lime" />
                  <span>My Tasks shows exactly what&apos;s yours, overdue and due-today first.</span>
                </li>
                <li className="flex gap-3">
                  <BellRing size={21} aria-hidden="true" className="mt-0.5 shrink-0 text-lime" />
                  <span>The owner gets an email reminder the day before a task is due.</span>
                </li>
              </ul>
            </div>
            {/* An illustrative task list, not real data. */}
            <div aria-hidden="true" className="rounded-[16px] bg-surface p-5 text-ink shadow-lg">
              <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">Example · Website relaunch</p>
              {[
                { title: "Write the homepage copy", owner: "A", ownerTint: "var(--harvest)", status: STATUSES[1] },
                { title: "Choose the photography", owner: "K", ownerTint: "var(--lime)", status: STATUSES[2] },
                { title: "Set up the domain", owner: null, ownerTint: "", status: STATUSES[0] },
              ].map((row) => (
                <div key={row.title} className="flex items-center gap-3 border-t border-line-soft py-3 first:border-t-0">
                  <span className="min-w-0 flex-1 truncate text-[15px] font-medium">{row.title}</span>
                  <span className="hidden items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold leading-6 sm:inline-flex" style={{ color: row.status.color, background: row.status.tint }}>
                    <row.status.icon size={13} strokeWidth={2.4} />
                    {row.status.label}
                  </span>
                  {row.owner ? (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-bold text-forest-deep" style={{ background: row.ownerTint }}>
                      {row.owner}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-line" />
                      Unassigned
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Collaboration ───────────────────── */}
        <section aria-labelledby="together-heading" className={`${SECTION} py-16 lg:py-24`}>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-16">
            <div>
              <p className="text-[14px] font-semibold uppercase tracking-[0.1em] text-forest">Bring people along</p>
              <h2 data-reveal id="together-heading" className="mt-3 font-display text-[36px] font-semibold leading-tight tracking-tight text-ink sm:text-[44px]">
                Invite by email. They join when they say yes.
              </h2>
              <p className="mt-4 text-[17px] leading-relaxed text-muted">
                Opening an invitation link doesn&apos;t give anyone access. Access starts only when the invited person accepts with that email.
              </p>
            </div>
            <ol className="flex flex-col gap-4" data-reveal-stagger>
              {[
                { icon: MailPlus, title: "An Owner or Admin invites", body: "Enter an email and a role. You can see whether the email was delivered, and resend or withdraw it." },
                { icon: UserCheck, title: "They accept", body: "New to Afritask? They sign up with that email, verify it, and come straight back to the invitation." },
                { icon: Users, title: "Everyone works from the same plan", body: "Members see every project and task. Owners and Admins manage projects, labels and people." },
              ].map(({ icon: Icon, title, body }, index) => (
                <li key={title} className="lift-on-hover flex gap-4 rounded-[14px] border border-line bg-surface p-5">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lime text-forest-deep">
                    <Icon size={20} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-[17px] font-semibold text-ink">
                      <span className="text-muted">{index + 1}.</span> {title}
                    </h3>
                    <p className="mt-1 text-[15.5px] leading-relaxed text-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ─── Progress ───────────────────── */}
        <section id="progress" aria-labelledby="progress-heading" className="scroll-mt-20 border-y border-line bg-surface py-16 lg:py-24">
          <div className={SECTION}>
            <div className="max-w-2xl" data-reveal>
              <p className="text-[14px] font-semibold uppercase tracking-[0.1em] text-forest">Progress</p>
              <h2 id="progress-heading" className="mt-3 font-display text-[36px] font-semibold leading-tight tracking-tight text-ink sm:text-[44px]">
                See how work is really moving.
              </h2>
            </div>
            <ol aria-label="Task statuses" className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4" data-reveal-stagger>
              {STATUSES.map(({ icon: Icon, label, color, tint }, index) => (
                <li key={label} className="relative flex items-center gap-3 rounded-[14px] p-4" style={{ background: tint }}>
                  <Icon size={22} aria-hidden="true" style={{ color }} strokeWidth={2.3} />
                  <span className="text-[16px] font-semibold" style={{ color }}>
                    {label}
                  </span>
                  {index < STATUSES.length - 1 && <ArrowRight size={18} aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 text-muted md:block" />}
                </li>
              ))}
            </ol>
            <ul className="mt-10 grid gap-6 md:grid-cols-3" data-reveal-stagger>
              <li className="flex gap-3">
                <span className="inline-flex shrink-0 gap-1 text-forest">
                  <LayoutList size={21} aria-hidden="true" />
                  <SquareKanban size={21} aria-hidden="true" />
                </span>
                <p className="text-[16px] leading-relaxed text-muted">
                  <strong className="text-ink">List or board, same work.</strong> Switch views without losing your filters. Change status from a menu, or drag cards.
                </p>
              </li>
              <li className="flex gap-3">
                <History size={21} aria-hidden="true" className="shrink-0 text-forest" />
                <p className="text-[16px] leading-relaxed text-muted">
                  <strong className="text-ink">A history you can trust.</strong> Every change is recorded with who made it and what it was before.
                </p>
              </li>
              <li className="flex gap-3">
                <CircleCheck size={21} aria-hidden="true" className="shrink-0 text-forest" />
                <p className="text-[16px] leading-relaxed text-muted">
                  <strong className="text-ink">Counts, not guesses.</strong> Overdue, due today and done this week. Each number opens the exact tasks behind it.
                </p>
              </li>
            </ul>
          </div>
        </section>

        {/* ─── Getting started ───────────────────── */}
        <section id="get-started" aria-labelledby="start-heading" className={`${SECTION} scroll-mt-20 py-16 lg:py-24`}>
          <h2 data-reveal id="start-heading" className="font-display text-[36px] font-semibold leading-tight tracking-tight text-ink sm:text-[44px]">
            Up and running in three steps
          </h2>
          <ol className="mt-10 grid gap-4 md:grid-cols-3" data-reveal-stagger>
            {[
              { title: "Create your account", body: "Sign up with your email (and verify it) or with Google." },
              { title: "Name your workspace", body: "Invite people now or later. It works the same with just you." },
              { title: "Write your first step", body: "A title is enough. Add a date, a project or an owner when it helps." },
            ].map((step, index) => (
              <li key={step.title} className="lift-on-hover rounded-[14px] border border-line bg-surface p-6">
                <span aria-hidden="true" className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-forest font-display text-[18px] font-semibold text-on-forest">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-[18px] font-semibold text-ink">
                  <span className="sr-only">Step {index + 1}: </span>
                  {step.title}
                </h3>
                <p className="mt-1.5 text-[15.5px] leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ─── Closing call to action ───────────────────── */}
        <section aria-labelledby="closing-heading" className={`${SECTION} pb-20`}>
          <div className="relative overflow-hidden rounded-[20px] bg-forest px-6 py-14 text-center text-on-forest sm:px-12">
            <svg aria-hidden="true" viewBox="0 0 600 200" className="pointer-events-none absolute inset-x-0 bottom-0 w-full opacity-30">
              {/* Kept in the bottom band so it never crosses the text above. */}
              <path d="M0 196 C 160 196, 240 170, 330 174 S 500 150, 600 146" fill="none" stroke="var(--lime)" strokeWidth="3" strokeDasharray="2 12" strokeLinecap="round" />
            </svg>
            <h2 id="closing-heading" className="relative font-display text-[36px] font-semibold leading-tight tracking-tight sm:text-[48px]">
              Start with one clear step.
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-[17px] leading-relaxed text-on-forest/80">
              Make a workspace, write down what&apos;s next, and bring people in when you&apos;re ready.
            </p>
            <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink href="/signup" size="lg" variant="lime">
                Create your account
              </ButtonLink>
              <Link href="/login" className="inline-flex h-12 items-center justify-center rounded-[10px] px-5 text-[16px] font-medium text-on-forest hover:bg-white/10">
                I already have an account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className={`${SECTION} flex flex-col gap-8 py-10`}>
          <NewsletterSignupForm />
          <div className="flex flex-col items-center justify-between gap-4 text-[14px] text-muted sm:flex-row">
            <Logo />
            <p>
              &copy; {new Date().getFullYear()} Afritask ·{" "}
              <Link href="/terms" className="underline-offset-4 hover:underline">
                Terms
              </Link>{" "}
              ·{" "}
              <Link href="/privacy" className="underline-offset-4 hover:underline">
                Privacy policy
              </Link>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
