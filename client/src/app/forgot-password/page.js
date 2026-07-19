"use client";

// Forgot-password page requests a reset link without exposing account state.
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import AuthLayout from "@/components/AuthLayout";
import FormField from "@/components/FormField";
import Button from "@/components/Button";

// Render the reset-link request form and delegate the submission to auth.
export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await forgotPassword(email);
    setLoading(false);
    if (res.success) setSent(true);
  };

  return (
    <AuthLayout
      eyebrow="Reset password"
      title={sent ? "Check your inbox" : "Forgot your password?"}
      subtitle={
        sent
          ? undefined
          : "Enter the email on your Afritask account and we'll send a reset link."
      }
    >
      {sent ? (
        <div className="rounded-xl p-5 mb-6" style={{ background: "var(--moss-light)" }}>
          <p className="text-sm" style={{ color: "var(--ink)" }}>
            If an account exists for <strong>{email}</strong>, a reset link is
            on its way.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField
            label="Email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          <Button type="submit" full loading={loading} size="lg">
            Send reset link
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
