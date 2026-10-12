// Contact page: public, so anyone can reach Afritask, with or without an account.
import { PublicFooter, PublicHeader } from "@/components/legal/PublicFrame";
import ContactForm from "@/components/contact/ContactForm";

export const metadata = {
  title: "Contact - Afritask",
  description: "Questions, problems or ideas about Afritask. Write to us and we'll reply by email.",
};

export default function ContactPage() {
  return (
    <div className="flex-1 flex flex-col">
      <PublicHeader />

      <main className="relative max-w-2xl w-full mx-auto px-6 py-12 flex-1">
        <p className="text-xs font-medium tracking-wide uppercase mb-2" style={{ color: "var(--moss)" }}>
          Contact
        </p>
        <h1 className="font-display text-4xl mb-3" style={{ color: "var(--ink)" }}>
          Talk to us
        </h1>
        <p className="mb-8 text-[15px] leading-7" style={{ color: "var(--ink-soft)" }}>
          A question before you sign up, something that isn&apos;t working, or an idea for the app.
          Write it here and we&apos;ll reply by email.
        </p>

        <ContactForm />
      </main>

      <PublicFooter />
    </div>
  );
}
