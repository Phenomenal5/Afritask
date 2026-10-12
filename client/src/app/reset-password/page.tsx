"use client";

// Choose a new password from the emailed link (?token=…). A missing or used token says
// so up front and offers a fresh link instead of letting the form fail.
import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import AuthLayout from "@/components/auth/AuthLayout";
import FormAlert from "@/components/auth/FormAlert";
import PasswordField from "@/components/auth/PasswordField";
import Button, { ButtonLink } from "@/components/ui/Button";

const PASSWORD_MIN_LENGTH = 6;
// Same limits as the server (utils/userValidation.ts).
const PASSWORD_MAX_LENGTH = 128;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const { resetPassword } = useAuth();
  const token = searchParams.get("token") || "";
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);

  if (!token) {
    return (
      <div className="flex flex-col gap-5">
        <FormAlert>This reset link is incomplete. Open the link from the newest reset email, or ask for a new one.</FormAlert>
        <ButtonLink href="/forgot-password" size="lg" full>
          Send a new reset link
        </ButtonLink>
      </div>
    );
  }

  if (complete) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-4 rounded-[14px] border border-lime-deep bg-lime/50 p-5" role="status">
          <CircleCheck size={26} aria-hidden="true" className="shrink-0 text-forest" />
          <p className="text-[15px] leading-relaxed text-ink">Your password is changed. For safety, you&apos;ve been signed out on other devices.</p>
        </div>
        <ButtonLink href="/login" size="lg" full>
          Sign in with your new password
        </ButtonLink>
      </div>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (form.password.length < PASSWORD_MIN_LENGTH) nextErrors.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
    else if (form.password.length > PASSWORD_MAX_LENGTH) nextErrors.password = `Keep your password to ${PASSWORD_MAX_LENGTH} characters or fewer.`;
    if (form.confirmPassword !== form.password) nextErrors.confirm = "This doesn't match the password above.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSubmitting(true);
    const result = await resetPassword({ token, password: form.password });
    setSubmitting(false);
    if (result.success) setComplete(true);
    else setFormError(result.message ?? "This reset link has expired or was already used. Ask for a new one.");
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && (
        <FormAlert>
          {formError}{" "}
          <Link href="/forgot-password" className="font-semibold underline underline-offset-2">
            Get a new link
          </Link>
        </FormAlert>
      )}
      <PasswordField
        label="New password"
        autoComplete="new-password"
        value={form.password}
        onChange={(event) => {
          setForm((current) => ({ ...current, password: event.target.value }));
          setErrors((current) => ({ ...current, password: undefined }));
        }}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        error={errors.password}
      />
      <PasswordField
        label="Confirm new password"
        autoComplete="new-password"
        value={form.confirmPassword}
        onChange={(event) => {
          setForm((current) => ({ ...current, confirmPassword: event.target.value }));
          setErrors((current) => ({ ...current, confirm: undefined }));
        }}
        error={errors.confirm}
      />
      <Button type="submit" size="lg" full loading={submitting}>
        Save new password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthLayout
      eyebrow="Reset your password"
      title="Choose a new password"
      description="Pick something you haven't used here before."
      footer={
        <Link href="/login" className="font-semibold text-forest underline-offset-4 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <title>Choose a new password · Afritask</title>
      {/* useSearchParams needs a Suspense boundary in Next. */}
      <Suspense fallback={<span className="skeleton block h-40" />}>
        <ResetPasswordForm />
      </Suspense>
    </AuthLayout>
  );
}
