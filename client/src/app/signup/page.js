"use client";

// Signup page collects the details needed to create a new Afritask account.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import AuthLayout from "@/components/AuthLayout";
import FormField from "@/components/FormField";
import Button from "@/components/Button";

// Render the registration flow and pass the payload into the auth context.
export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", age: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      name: form.name,
      email: form.email,
      password: form.password,
      ...(form.age ? { age: Number(form.age) } : {}),
    };
    const res = await signup(payload);
    setLoading(false);
    if (res.success) setDone(true);
  };

  if (done) {
    return (
      <AuthLayout eyebrow="One more step" title="Check your inbox">
        <div
          className="rounded-xl p-5 mb-6"
          style={{ background: "var(--moss-light)" }}
        >
          <p className="text-sm" style={{ color: "var(--ink)" }}>
            We sent a verification link to <strong>{form.email}</strong>.
            Click it to activate your account, then come back and sign in.
          </p>
        </div>
        <Button full onClick={() => router.push("/login")}>
          Go to sign in
        </Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Get started"
      title="Create your Afritask account"
      subtitle="Set up your workspace in under a minute."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormField
          label="Full name"
          name="name"
          value={form.name}
          onChange={handleChange}
          placeholder="Abdul"
          autoComplete="name"
          required
        />
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
          type="password"
          value={form.password}
          onChange={handleChange}
          placeholder="At least 6 characters"
          autoComplete="new-password"
          required
        />
        <FormField
          label="Age (optional)"
          name="age"
          type="number"
          value={form.age}
          onChange={handleChange}
          placeholder="25"
        />

        <Button type="submit" full loading={loading} size="lg">
          Create account
        </Button>
      </form>

      <p className="text-sm text-center mt-8" style={{ color: "var(--ink-soft)" }}>
        Already have an account?{" "}
        <Link href="/login" className="font-medium hover:underline" style={{ color: "var(--moss)" }}>
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
