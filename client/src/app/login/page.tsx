"use client";

// Sign in with email/password or Google. Messages appear next to the form, and a pending
// invitation or an expired session's page is where you land afterwards.
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { readPendingInvite } from "@/utils/pendingInvite";
import AuthLayout from "@/components/auth/AuthLayout";
import FormAlert from "@/components/auth/FormAlert";
import PasswordField from "@/components/auth/PasswordField";
import GoogleButton, { OrDivider } from "@/components/auth/GoogleButton";
import Button from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, authLoading } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasPendingInvite, setHasPendingInvite] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  // Already signed in (e.g. opened /login in a new tab) — straight to the workspace.
  useEffect(() => {
    if (!authLoading && isAuthenticated && !submitting) router.replace("/dashboard");
  }, [authLoading, isAuthenticated, submitting, router]);

  // Explain why we're here: a failed Google sign-in, or a session that ended.
  // Strip the flag afterwards so a refresh is quiet.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "google") setFormError("Google sign-in was cancelled or didn't finish. Try again, or use your email and password.");
    if (params.get("expired") === "1") setNotice("Your session ended, so we signed you out to keep your account safe. Sign in again and you'll be taken back to where you were.");
    if (params.has("error") || params.has("expired")) window.history.replaceState(null, "", "/login");
    setHasPendingInvite(!!readPendingInvite());
  }, []);

  const updateField = (field: "email" | "password", value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors: typeof fieldErrors = {};
    if (!EMAIL_PATTERN.test(form.email.trim())) errors.email = "Enter the email you signed up with, like name@example.com.";
    if (!form.password) errors.password = "Enter your password.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      emailRef.current?.focus();
      return;
    }
    setSubmitting(true);
    const result = await login({ email: form.email.trim(), password: form.password });
    if (!result.success) {
      setSubmitting(false);
      setFormError(result.message ?? "We couldn't sign you in. Check your email and password.");
    }
  };

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in to Afritask"
      description={hasPendingInvite ? "Sign in to respond to the invitation you opened. We'll take you straight back to it." : "Pick up where you left off."}
      footer={
        <>
          New to Afritask?{" "}
          <Link href="/signup" className="font-semibold text-forest underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <title>Sign in · Afritask</title>
      <div className="flex flex-col gap-5">
        {notice && <FormAlert tone="info">{notice}</FormAlert>}
        {formError && <FormAlert>{formError}</FormAlert>}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <TextField
            ref={emailRef}
            label="Email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(event) => updateField("email", event.target.value)}
            error={fieldErrors.email}
          />
          <PasswordField
            label="Password"
            autoComplete="current-password"
            value={form.password}
            onChange={(event) => updateField("password", event.target.value)}
            error={fieldErrors.password}
          />
          <Link href="/forgot-password" className="-mt-1 self-end rounded text-[14px] font-medium text-forest underline-offset-4 hover:underline">
            Forgot your password?
          </Link>
          <Button type="submit" size="lg" full loading={submitting}>
            Sign in
          </Button>
        </form>
      </div>
      <OrDivider />
      <GoogleButton />
    </AuthLayout>
  );
}
