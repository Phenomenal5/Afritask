"use client";

// Shown instead of the app to a signed-in account that hasn't accepted the current terms:
// Google sign-ups (they never see the signup checkbox), accounts from before terms
// existed, and everyone after the terms change. The server refuses their app requests
// (403 terms_required) until they accept, so this is the only way forward — or sign out.
import { useState, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import AuthLayout from "@/components/auth/AuthLayout";
import FormAlert from "@/components/auth/FormAlert";
import TermsCheckbox from "@/components/auth/TermsCheckbox";
import Button from "@/components/ui/Button";

export default function TermsGate() {
  const { user, acceptTerms, logout } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [checkboxError, setCheckboxError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!agreed) {
      setCheckboxError("Tick the box to continue.");
      return;
    }
    setSubmitting(true);
    const result = await acceptTerms();
    setSubmitting(false);
    if (!result.success) setFormError(result.message ?? "We couldn't save that. Try again.");
  };

  return (
    <AuthLayout
      eyebrow={user ? `Hi ${user.name.split(" ")[0]}` : "One quick thing"}
      title="Please review our terms"
      description="Before you continue, read and accept the Terms of Service and Privacy Policy. They explain what you can expect from Afritask and how we handle your data."
    >
      <title>Accept the terms · Afritask</title>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError && <FormAlert>{formError}</FormAlert>}
        <TermsCheckbox
          checked={agreed}
          onChange={(checked) => {
            setAgreed(checked);
            setCheckboxError(null);
          }}
          error={checkboxError}
        />
        <Button type="submit" size="lg" full loading={submitting}>
          Accept and continue
        </Button>
        <button type="button" onClick={logout} className="self-center text-[14px] font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
          Not now, sign out
        </button>
      </form>
    </AuthLayout>
  );
}
