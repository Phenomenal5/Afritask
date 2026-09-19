// Privacy policy page — public (no ProtectedRoute) so signed-out visitors and
// Google's OAuth consent screen reviewers can read it.
// NOTE: every claim here mirrors real server behaviour (User/Task models,
// email.js, taskReminder.js, upload.js, logger). If you change what the app
// collects, stores, or emails, update this page and LAST_UPDATED with it.
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";

export const metadata = {
  title: "Privacy Policy - Afritask",
  description:
    "How Afritask collects, uses, and protects your information, and the choices you have over it.",
};

const LAST_UPDATED = "September 19, 2026";

// Set NEXT_PUBLIC_CONTACT_EMAIL to publish a privacy contact address. It's an
// env var (not hardcoded) so a personal inbox never gets committed; when it's
// unset the Contact section falls back to replying to an Afritask email.
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

const SUMMARY_POINTS = [
  "We collect only what Afritask needs to work: your account details, your tasks, and basic server logs.",
  "Your tasks are private to your account. No other user can see them.",
  "We don't sell your data, show ads, or use analytics or tracking cookies.",
  "You can edit your details at any time and ask us to delete everything.",
];

// Styles nested strong/a/code/ul once, instead of repeating inline styles on
// every element across the twelve sections below.
const PROSE_CLASSES = [
  "flex flex-col gap-3 text-[15px] leading-7",
  "[&_strong]:font-semibold [&_strong]:text-[var(--ink)]",
  "[&_a]:font-medium [&_a]:text-[var(--moss)] [&_a]:underline [&_a]:underline-offset-2",
  "[&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[13px] [&_code]:bg-[var(--line-soft)] [&_code]:text-[var(--ink)]",
  "[&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-5 [&_ul]:list-disc [&_li]:marker:text-[var(--moss)]",
].join(" ");

// ─── Layout helpers ─────────────────────────────────

function Section({ id, number, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 pt-10">
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

export default function PrivacyPage() {
  return (
    <div className="flex-1 flex flex-col">
      <header
        className="sticky top-0 z-20 backdrop-blur-sm"
        style={{
          background: "color-mix(in srgb, var(--paper) 86%, transparent)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* "/" already routes to the dashboard or login based on session */}
          <Link href="/" className="font-display text-xl italic" style={{ color: "var(--ink)" }}>
            Afritask
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="relative max-w-2xl w-full mx-auto px-6 py-12 flex-1">
        <p
          className="text-xs font-medium tracking-wide uppercase mb-2"
          style={{ color: "var(--moss)" }}
        >
          Legal
        </p>
        <h1 className="font-display text-4xl mb-2" style={{ color: "var(--ink)" }}>
          Privacy Policy
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
          Last updated {LAST_UPDATED}
        </p>

        <p className="text-[15px] leading-7" style={{ color: "var(--ink-soft)" }}>
          This policy explains what information Afritask collects when you use the
          app, why we need it, who it&apos;s shared with, and the choices you have.
          It&apos;s written to match how Afritask actually works, and we&apos;ll
          update it if that ever changes.
        </p>

        <div className="rounded-xl p-5 mt-8" style={{ background: "var(--moss-light)" }}>
          <p
            className="text-xs font-medium tracking-wide uppercase mb-3"
            style={{ color: "var(--moss-dark)" }}
          >
            The short version
          </p>
          <ul className="flex flex-col gap-2.5">
            {SUMMARY_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-start gap-3 text-sm leading-6"
                style={{ color: "var(--ink)" }}
              >
                <svg
                  width="12"
                  height="10"
                  viewBox="0 0 9 7"
                  fill="none"
                  aria-hidden="true"
                  className="mt-1.5 flex-shrink-0"
                >
                  <path
                    d="M1 3.5L3.2 5.7L8 1"
                    stroke="var(--moss)"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <Section id="information-we-collect" number={1} title="Information we collect">
          <ul>
            <li>
              <strong>Account details.</strong> Your name, your email address, and
              your age if you choose to add it. If you sign up with email, we also
              store your password, but only as a one-way bcrypt hash. We never see
              or keep the password itself.
            </li>
            <li>
              <strong>Profile picture.</strong> If you upload one (PNG, JPG, or GIF,
              up to 5&nbsp;MB).
            </li>
            <li>
              <strong>Google sign-in.</strong> If you continue with Google, we ask
              Google only for your basic profile and email address. We keep your
              name, email, and Google account ID so we can recognise you next time.
              We never receive your Google password, and we don&apos;t access your
              Gmail, Drive, contacts, or calendar.
            </li>
            <li>
              <strong>Your tasks.</strong> Each task&apos;s title, description,
              status, priority, and deadline, plus when it was created and last
              changed.
            </li>
            <li>
              <strong>Server logs.</strong> When your browser talks to our server,
              we record your IP address, browser type, the address requested, and
              the time. We also log account and task activity, such as sign-ins,
              failed sign-in attempts, and the titles of new tasks, alongside your
              email address or account ID.
            </li>
          </ul>
        </Section>

        <Section id="browser-storage" number={2} title="What's stored in your browser">
          <p>
            Afritask saves two things in your browser&apos;s local storage:{" "}
            <code>afritask_token</code> keeps you signed in, and{" "}
            <code>afritask_theme</code> remembers whether you prefer light or dark
            mode. Signing out removes the sign-in token.
          </p>
          <p>
            We don&apos;t use cookies to track you, and Afritask has no analytics,
            advertising, or third-party tracking scripts.
          </p>
        </Section>

        <Section id="how-we-use-it" number={3} title="How we use your information">
          <ul>
            <li>
              To create your account, verify your email, sign you in, and reset your
              password when you ask.
            </li>
            <li>
              To store and show your tasks. Every request is checked against your
              account, so you only ever see your own tasks.
            </li>
            <li>To send the emails the app depends on (see the next section).</li>
            <li>
              To keep Afritask working and secure, for example by fixing errors,
              looking into suspicious sign-in activity, and preventing abuse.
            </li>
          </ul>
          <p>
            We don&apos;t sell your information, use it for advertising, or share it
            with other Afritask users.
          </p>
        </Section>

        <Section id="emails" number={4} title="Emails we send">
          <ul>
            <li>
              A link to verify your email when you sign up, and a welcome message
              once your account is active.
            </li>
            <li>
              Password reset links when you request them, and a notice whenever your
              password changes.
            </li>
            <li>
              <strong>Task reminders.</strong> Each morning, we email you about any
              task that is due the next day and isn&apos;t marked complete. The email
              includes the task&apos;s title, deadline, and description.
            </li>
          </ul>
          <p>
            We don&apos;t send marketing email. To stop a reminder for a task, mark
            it complete or remove its deadline.
          </p>
        </Section>

        <Section id="sharing" number={5} title="Who we share it with">
          <p>
            We share information only with the service providers that help run
            Afritask, and each one gets only what it needs:
          </p>
          <ul>
            <li>
              <strong>Brevo</strong> delivers our emails, so it receives your email
              address and the content of each message. That includes your name and,
              for reminders, your task details.
            </li>
            <li>
              <strong>Google</strong> takes part only if you choose Google sign-in,
              as described above.
            </li>
            <li>
              <strong>Hosting providers</strong> run our website, server, and
              database, and store the information described in this policy for us.
            </li>
          </ul>
          <p>
            We may also share information if the law requires it, or to protect
            Afritask&apos;s users from harm or fraud.
          </p>
        </Section>

        <Section id="profile-pictures" number={6} title="Profile pictures">
          {/* NOTE: uploads are served by express.static("public") with no auth
              check, so the photo URL is unlisted, not private. Don't soften
              this wording unless uploads move behind `protect`. */}
          <p>
            Your picture is stored on our server and shown through a link that
            isn&apos;t published or listed anywhere. However, anyone who has that
            exact link can open the image, so please don&apos;t upload a picture you
            need to keep strictly private.
          </p>
        </Section>

        <Section id="security" number={7} title="How we protect your data">
          <ul>
            <li>Passwords are hashed with bcrypt before they&apos;re saved.</li>
            <li>
              Email verification and password reset links use long random tokens
              that expire, and a reset link stops working once it has been used.
            </li>
            <li>
              Your tasks can be read or changed only by requests signed with your
              account&apos;s token.
            </li>
            <li>
              Data travels between your browser and our servers over encrypted HTTPS
              connections.
            </li>
          </ul>
          <p>
            No online service can promise perfect security, but we work to keep
            your information safe and will let you know promptly if a breach
            affects your account.
          </p>
        </Section>

        <Section id="retention" number={8} title="How long we keep it">
          <p>
            We keep your account details and tasks for as long as your account
            exists. When you delete a task, we remove it from our database right
            away. We keep server logs only as long as we need them for
            troubleshooting and security.
          </p>
          {/* NOTE: replacing an avatar doesn't delete the old file on disk
              (upload.js never unlinks), so account deletion has to sweep
              previous pictures too, as promised here. */}
          <p>
            If you ask us to delete your account, we remove your account details,
            your tasks, and your profile pictures, including earlier ones you have
            since replaced.
          </p>
        </Section>

        <Section id="your-choices" number={9} title="Your choices and rights">
          <ul>
            <li>
              <strong>See and edit your details.</strong> Update your name, age, and
              profile picture, or change your password, on your{" "}
              <Link href="/profile">Profile</Link> page.
            </li>
            <li>
              <strong>Delete tasks</strong> at any time from your dashboard.
            </li>
            <li>
              <strong>Get a copy</strong> of the information we hold about you, or
              ask us to correct it.
            </li>
            <li>
              <strong>Delete your account.</strong> You can&apos;t delete your
              account in the app yet. Email us from the address on your account and
              we&apos;ll delete your account and everything linked to it within 30
              days.
            </li>
            <li>
              <strong>Disconnect Google.</strong> You can remove Afritask&apos;s
              access at any time from your{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Account permissions
              </a>
              .
            </li>
          </ul>
        </Section>

        <Section id="children" number={10} title="Children">
          <p>
            Afritask isn&apos;t meant for children under 13, and we don&apos;t
            knowingly collect their information. If you think a child has created
            an account, contact us and we&apos;ll delete it.
          </p>
        </Section>

        <Section id="changes" number={11} title="Changes to this policy">
          <p>
            If we change how we handle your information, we&apos;ll update this page
            and the &ldquo;Last updated&rdquo; date at the top. For significant
            changes, we&apos;ll also email you before they take effect.
          </p>
        </Section>

        <Section id="contact" number={12} title="Contact us">
          {CONTACT_EMAIL ? (
            <p>
              Have a question, or want to see, correct, or delete your data? Email
              us at <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and
              we&apos;ll get back to you.
            </p>
          ) : (
            <p>
              Have a question, or want to see, correct, or delete your data? Reply
              to any email you&apos;ve received from Afritask and we&apos;ll get
              back to you.
            </p>
          )}
        </Section>
      </main>

      <footer className="relative" style={{ borderTop: "1px solid var(--line)" }}>
        <div
          className="max-w-2xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-3 text-xs"
          style={{ color: "var(--ink-soft)" }}
        >
          <span>&copy; {new Date().getFullYear()} Afritask</span>
          <Link href="/" className="font-medium hover:underline" style={{ color: "var(--moss)" }}>
            Back to Afritask
          </Link>
        </div>
      </footer>
    </div>
  );
}
