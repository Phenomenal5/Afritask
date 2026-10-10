"use client";

// First-time setup for a verified account with no workspace yet (PRD J1).
import AuthLayout from "@/components/auth/AuthLayout";
import RequireSession from "@/components/auth/RequireSession";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";

export default function OnboardingPage() {
  return (
    <RequireSession>
      <AuthLayout eyebrow="Welcome to Afritask" title="Let's set up your workspace" description="Three short steps. Only the first is required.">
        <title>Set up your workspace · Afritask</title>
        <OnboardingFlow mode="first" />
      </AuthLayout>
    </RequireSession>
  );
}
