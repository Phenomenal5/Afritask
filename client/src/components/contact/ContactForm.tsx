"use client";

// The Contact page form. Anyone can write; the message reaches the same support queue as
// in-app requests, and the answer comes by email.
// - Signed in? We point to Support, where the reply also shows in the app.
// - `website` is a honeypot: hidden from people, so only bots fill it in (the server
//   quietly drops those). It's off-screen rather than display:none, which some bots skip.
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { CircleCheck, Send } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { sendContactMessage } from "@/lib/services/contactService";
import { failureMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/States";
import { CATEGORY_LABELS } from "@/components/support/supportLabels";
import type { SupportTicketCategory } from "@/types/models";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_MAX_LENGTH = 80;
const MESSAGE_MIN_LENGTH = 10;
const MESSAGE_MAX_LENGTH = 5000;

type FieldErrors = Partial<Record<"name" | "email" | "message" | "form", string>>;

export default function ContactForm() {
  const { user } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", topic: "question" as SupportTicketCategory, message: "", website: "" });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ number: number | null; email: string } | null>(null);

  // Signed in: fill in who they are (they can still change it).
  useEffect(() => {
    if (user) setForm((current) => ({ ...current, name: current.name || user.name, email: current.email || user.email }));
  }, [user]);

  const update = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors({});
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: FieldErrors = {};
    if (!form.name.trim()) nextErrors.name = "Tell us your name.";
    else if (form.name.trim().length > NAME_MAX_LENGTH) nextErrors.name = `Keep your name to ${NAME_MAX_LENGTH} characters or fewer.`;
    if (!EMAIL_PATTERN.test(form.email.trim())) nextErrors.email = "Enter a full email address, like name@example.com. We reply there.";
    if (form.message.trim().length < MESSAGE_MIN_LENGTH) nextErrors.message = "Tell us a little more, so we can help.";
    if (Object.keys(nextErrors).length) return setErrors(nextErrors);

    setSending(true);
    try {
      const response = await sendContactMessage({ ...form, name: form.name.trim(), email: form.email.trim(), message: form.message.trim() });
      setSent({ number: response.data.data.ticket.number, email: form.email.trim() });
    } catch (failure) {
      // Everything they wrote stays in the form.
      setErrors({ form: failureMessage(failure, "Your message didn't send. Check your connection and try again.") });
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-[14px] border border-line bg-surface p-6">
        <CircleCheck size={28} aria-hidden="true" className="text-done" />
        <h2 className="text-[18px] font-semibold text-ink">Thanks, we&apos;ve got your message{sent.number ? ` (#${sent.number})` : ""}.</h2>
        <p className="text-[15px] leading-relaxed text-muted">
          We&apos;ll reply to <strong className="text-ink">{sent.email}</strong>. If you write again about the same thing, mention
          {sent.number ? ` #${sent.number}` : " this message"} so we can keep it together.
        </p>
        <Button variant="secondary" onClick={() => setSent(null)}>
          Write another message
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {user && (
        <Notice>
          You&apos;re signed in, so you can also write from <Link href="/support" className="font-semibold underline underline-offset-2">Support</Link>,
          where our reply shows up in the app as well as by email.
        </Notice>
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Your name" autoComplete="name" maxLength={NAME_MAX_LENGTH} value={form.name} onChange={(event) => update("name", event.target.value)} error={errors.name} />
          <TextField label="Email" type="email" autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} error={errors.email} />
        </div>
        <SelectField label="What's it about?" value={form.topic} onChange={(event) => update("topic", event.target.value)}>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextAreaField
          label="Message"
          rows={6}
          maxLength={MESSAGE_MAX_LENGTH}
          value={form.message}
          onChange={(event) => update("message", event.target.value)}
          error={errors.message}
          hint="If something isn't working, say what you did and what you saw."
        />

        {/* Honeypot: hidden from people and from screen readers. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label htmlFor="contact-website">Leave this empty</label>
          <input id="contact-website" tabIndex={-1} autoComplete="off" value={form.website} onChange={(event) => update("website", event.target.value)} />
        </div>

        {errors.form && (
          <p role="alert" className="text-[14px] text-brick">
            {errors.form}
          </p>
        )}
        <div>
          <Button type="submit" loading={sending} icon={<Send size={16} aria-hidden="true" />}>
            Send message
          </Button>
        </div>
      </form>
    </div>
  );
}
