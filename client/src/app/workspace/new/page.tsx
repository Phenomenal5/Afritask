"use client";

// Create an ADDITIONAL workspace (e.g. a team space next to a personal one). Same steps
// as onboarding; existing workspaces are never changed.
import Link from "next/link";
import AuthLayout from "@/components/auth/AuthLayout";
import RequireSession from "@/components/auth/RequireSession";
import OnboardingFlow from "@/components/onboarding/OnboardingFlow";

export default function NewWorkspacePage() {
  return (
    <RequireSession>
      <AuthLayout
        eyebrow="New workspace"
        title="Create another workspace"
        description="You'll be its Owner. Its people, projects and tasks stay separate from your other workspaces."
        footer={
          <Link href="/dashboard" className="font-semibold text-forest underline-offset-4 hover:underline">
            Cancel and go back
          </Link>
        }
      >
        <title>New workspace · Afritask</title>
        <OnboardingFlow mode="additional" />
      </AuthLayout>
    </RequireSession>
  );
}
