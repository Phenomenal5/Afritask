"use client";

// Create an account. Arriving from an invitation pre-fills the invited email (accepting
// only works with that exact address) and the invitation is remembered through email
// verification, which opens in a new tab (see utils/pendingInvite).
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { readPendingInvite } from "@/utils/pendingInvite";
import AuthLayout from "@/components/auth/AuthLayout";
import FormAlert from "@/components/auth/FormAlert";
import PasswordField from "@/components/auth/PasswordField";
import GoogleButton, { OrDivider } from "@/components/auth/GoogleButton";
import TermsCheckbox from "@/components/auth/TermsCheckbox";
import Button, { ButtonLink } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 6;

type FieldName = "name" | "email" | "password" | "age" | "terms";

export default function SignupPage() {
  const router = useRouter();
  const { signup, isAuthenticated, authLoading } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "", age: "" });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) router.replace("/dashboard");
  }, [authLoading, isAuthenticated, router]);

  useEffect(() => {
    const emailFromInvite = new URLSearchParams(window.location.search).get("email");
    if (emailFromInvite && readPendingInvite()) {
      setInvitedEmail(emailFromInvite);
      setForm((current) => ({ ...current, email: emailFromInvite }));
    }
  }, []);

  const updateField = (field: Exclude<FieldName, "terms">, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors: typeof fieldErrors = {};
    if (!form.name.trim()) errors.name = "Tell us your name — it's how teammates will see you.";
    if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = "Enter a full email address, like name@example.com.";
    if (form.password.length < PASSWORD_MIN_LENGTH) errors.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
    if (form.age && (!/^\d+$/.test(form.age) || Number(form.age) < 1 || Number(form.age) > 120)) errors.age = "Enter a whole number, or leave it empty.";
    if (!acceptedTerms) errors.terms = "You need to accept the Terms of Service and Privacy Policy to create an account.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      nameRef.current?.focus();
      return;
    }
    setSubmitting(true);
    const result = await signup({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      ...(form.age ? { age: Number(form.age) } : {}),
      acceptTerms: acceptedTerms,
    });
    setSubmitting(false);
    if (result.success) setSentTo(form.email.trim());
    else setFormError(result.message ?? "We couldn't create your account.");
  };

  if (sentTo) {
    return (
      <AuthLayout eyebrow="One more step" title="Check your inbox">
        <title>Verify your email · Afritask</title>
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-4 rounded-[14px] border border-lime-deep bg-lime/50 p-5">
            <MailCheck size={26} aria-hidden="true" className="shrink-0 text-forest" />
            <div className="text-[15px] leading-relaxed text-ink" role="status">
              <p>
                We sent a verification link to <strong>{sentTo}</strong>.
              </p>
              <p className="mt-2">Open it to activate your account, then sign in{invitedEmail ? " — we'll take you back to your invitation" : ""}.</p>
            </div>
          </div>
          <p className="text-[14px] text-muted">
            Nothing arrived after a few minutes? Check spam, or make sure the address is right. The link expires, so use the newest email.
          </p>
          <ButtonLink href="/login" size="lg" full>
            Go to sign in
          </ButtonLink>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Get started"
      title="Create your account"
      description={invitedEmail ? "You've been invited to a workspace. Sign up with the invited email to accept it." : "Free to start. You'll name your workspace next — inviting people is optional."}
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-forest underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <title>Create your account · Afritask</title>
      <div className="flex flex-col gap-5">
        {formError && <FormAlert>{formError}</FormAlert>}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <TextField ref={nameRef} label="Full name" autoComplete="name" value={form.name} onChange={(event) => updateField("name", event.target.value)} error={fieldErrors.name} />
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            error={fieldErrors.email}
            hint={invitedEmail ? "This is the address the invitation was sent to. A different address can't accept it." : undefined}
          />
          <PasswordField
            label="Password"
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => updateField("password", event.target.value)}
            hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
            error={fieldErrors.password}
          />
          <TextField label="Age" optional inputMode="numeric" value={form.age} onChange={(event) => updateField("age", event.target.value)} error={fieldErrors.age} wrapperClassName="max-w-[10rem]" />
          <TermsCheckbox
            checked={acceptedTerms}
            onChange={(checked) => {
              setAcceptedTerms(checked);
              setFieldErrors((current) => ({ ...current, terms: undefined }));
            }}
            error={fieldErrors.terms}
          />
          <Button type="submit" size="lg" full loading={submitting}>
            Create account
          </Button>
        </form>
      </div>
      {!invitedEmail && (
        <>
          <OrDivider />
          <GoogleButton label="Sign up with Google" />
        </>
      )}
    </AuthLayout>
  );
}
