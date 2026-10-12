"use client";

// Request a reset link. The answer is the same whether or not the account exists, so the
// page never reveals who has an account.
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import AuthLayout from "@/components/auth/AuthLayout";
import FormAlert from "@/components/auth/FormAlert";
import Button from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!EMAIL_PATTERN.test(email.trim())) {
      setEmailError("Enter the email on your account, like name@example.com.");
      return;
    }
    setSubmitting(true);
    const result = await forgotPassword(email.trim());
    setSubmitting(false);
    if (result.success) setSent(true);
    else setFormError(result.message ?? "We couldn't send the reset link. Try again in a moment.");
  };

  const backToSignIn = (
    <Link href="/login" className="font-semibold text-forest underline-offset-4 hover:underline">
      Back to sign in
    </Link>
  );

  return (
    <AuthLayout
      eyebrow="Reset your password"
      title={sent ? "Check your inbox" : "Forgot your password?"}
      description={sent ? undefined : "Enter your account's email and we'll send a link to choose a new password."}
      footer={backToSignIn}
    >
      <title>Reset your password · Afritask</title>
      {sent ? (
        <div className="flex items-start gap-4 rounded-[14px] border border-lime-deep bg-lime/50 p-5" role="status">
          <MailCheck size={26} aria-hidden="true" className="shrink-0 text-forest" />
          <div className="text-[15px] leading-relaxed text-ink">
            <p>
              If there&apos;s an Afritask account for <strong>{email.trim()}</strong>, a reset link is on its way.
            </p>
            <p className="mt-2 text-muted">The link works once and expires soon. Resetting your password signs you out everywhere else.</p>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {formError && <FormAlert>{formError}</FormAlert>}
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError(null);
              setFormError(null);
            }}
            error={emailError}
          />
          <Button type="submit" size="lg" full loading={submitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
