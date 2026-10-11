"use client";

// Landing page footer: subscribe to the newsletter without an account. The server emails a
// confirmation link first (double opt-in), so the answer is always "check your inbox".
import { useState, type FormEvent } from "react";
import { subscribeToNewsletter } from "@/lib/services/newsletterService";
import { failureMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function NewsletterSignupForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!EMAIL_PATTERN.test(email.trim())) return setError("Enter a full email address, like name@example.com.");
    setSubmitting(true);
    try {
      const res = await subscribeToNewsletter(email.trim());
      setConfirmation(res.data.message);
      setEmail("");
    } catch (failure) {
      setError(failureMessage(failure, "That didn't go through. Try again in a moment."));
    } finally {
      setSubmitting(false);
    }
  };

  if (confirmation) {
    return (
      <p role="status" className="max-w-sm text-[14.5px] font-medium text-ink">
        {confirmation}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-start">
      <TextField
        label="Get the Afritask newsletter"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          setError(null);
        }}
        error={error}
        hint="Now and then. Unsubscribe with one click."
        wrapperClassName="flex-1"
      />
      <Button type="submit" loading={submitting} className="sm:mt-[30px]">
        Subscribe
      </Button>
    </form>
  );
}
