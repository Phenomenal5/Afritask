"use client";

// Reset-password page turns a tokenized link into a new account password.
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import Button from "@/components/Button";
import FormField from "@/components/FormField";
import { useAuth } from "@/context/AuthContext";

// Render the reset form and submit the token/password pair through auth.
function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resetPassword } = useAuth();

  const token = searchParams.get("token") || "";
  const [form, setForm] = useState({ password: "", confirmPassword: "" });
  const [loading, setLoading] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    setError("");
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!token) {
      setError("This reset link is missing a token.");
      return;
    }

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const payload = {token, password: form.password}
    const res = await resetPassword(payload);
    setLoading(false);

    if (res.success) {
      setComplete(true);
      setTimeout(() => router.push("/login"), 1200);
    }
  };

  return (
    <AuthLayout
      eyebrow="New password"
      title={complete ? "Password updated" : "Choose a new password"}
      subtitle={
        complete
          ? "You can now sign in with your new password."
          : "Create a fresh password for your Afritask account."
      }
    >
      {complete ? (
        <div className="rounded-xl p-5" style={{ background: "var(--moss-light)" }}>
          <p className="text-sm" style={{ color: "var(--ink)" }}>
            Your password has been reset. Sending you back to sign in.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField
            label="New password"
            name="password"
            type="password"
            value={form.password}
            onChange={handleChange}
            placeholder="Minimum 6 characters"
            autoComplete="new-password"
            required
          />
          <FormField
            label="Confirm password"
            name="confirmPassword"
            type="password"
            value={form.confirmPassword}
            onChange={handleChange}
            placeholder="Repeat your password"
            autoComplete="new-password"
            required
            error={error}
          />
          <Button type="submit" full loading={loading} size="lg">
            Reset password
          </Button>
        </form>
      )}

      <p className="text-sm text-center mt-8" style={{ color: "var(--ink-soft)" }}>
        <Link href="/login" className="font-medium hover:underline" style={{ color: "var(--moss)" }}>
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  );
}
