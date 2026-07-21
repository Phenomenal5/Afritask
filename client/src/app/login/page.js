"use client";

// Login page handles credential sign-in and the Google OAuth entry point.
import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import AuthLayout from "@/components/AuthLayout";
import FormField from "@/components/FormField";
import Button from "@/components/Button";
import { googleLoginUrl } from "@/lib/services/authService";

// Render the sign-in form and hand credentials to the auth context.
export default function LoginPage() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Passport bounces a failed/cancelled Google sign-in back here with
  // ?error=google. Surface it once, then strip the flag so a refresh is quiet.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "google") {
      toast.error("Google sign-in was cancelled or failed. Please try again.");
      window.history.replaceState(null, "", "/login");
    }
  }, []);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await login(form);
    setLoading(false);
  };

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in to Afritask"
      subtitle="Jump back into Afritask and keep things moving."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField
          label="Email"
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
        <FormField
          label="Password"
          name="password"
          type={showPassword ? "text" : "password"}
          value={form.password}
          onChange={handleChange}
          placeholder="••••••••"
          autoComplete="current-password"
          required
          rightElement={
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="text-xs cursor-pointer"
              style={{ color: "var(--ink-soft)" }}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          }
        />

        <div className="flex justify-end -mt-1">
          <Link
            href="/forgot-password"
            className="text-xs hover:underline"
            style={{ color: "var(--moss)" }}
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" full loading={loading} size="lg">
          Sign in
        </Button>
      </form>

      <div className="flex items-center gap-3 my-6">
        <div className="h-px flex-1" style={{ background: "var(--line)" }} />
        <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
          or
        </span>
        <div className="h-px flex-1" style={{ background: "var(--line)" }} />
      </div>

      <a
        href={googleLoginUrl()}
        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--line-soft)]"
        style={{ border: "1px solid var(--line)", color: "var(--ink)" }}
      >
        <span
          className="inline-flex w-4 h-4 items-center justify-center rounded-full text-[10px] font-semibold"
          style={{ background: "var(--moss-light)", color: "var(--moss-dark)" }}
        >
          G
        </span>
        Continue with Google
      </a>

      <p className="text-sm text-center mt-8" style={{ color: "var(--ink-soft)" }}>
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium hover:underline" style={{ color: "var(--moss)" }}>
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
