"use client";

// Onboarding: a verified account with no workspace creates its first one (PRD J1).
// Only the workspace name is required — projects and invitations come later and are
// skippable, so the first task is never more than one step away.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useUser } from "@/context/UserContext";
import { useWorkspaces } from "@/context/WorkspaceContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AuthLayout from "@/components/AuthLayout";
import FormField from "@/components/FormField";
import TimezoneSelect from "@/components/TimezoneSelect";
import Button from "@/components/Button";
import { detectTimezone } from "@/utils/timezones";
import PendingInvitations from "@/components/PendingInvitations";

function OnboardingForm() {
  const router = useRouter();
  const { user } = useAuth();
  const { updateProfile } = useUser();
  const { createWorkspace } = useWorkspaces();
  const firstName = user?.name?.split(" ")[0] || "My";

  const [workspaceName, setWorkspaceName] = useState(`${firstName}'s workspace`);
  // Google sign-ups start on the server default (UTC) — offer the device zone instead.
  const [timezone, setTimezone] = useState(
    user?.timezone && user.timezone !== "UTC" ? user.timezone : detectTimezone()
  );
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    if (timezone !== user?.timezone) await updateProfile({ timezone });
    const res = await createWorkspace(workspaceName);
    setSaving(false);
    if (res.success) router.replace("/dashboard");
  };

  return (
    <>
    {/* Invited by a team? Joining it can replace creating your own (PRD J2). */}
    <PendingInvitations onAccepted={() => router.replace("/dashboard")} />
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormField
        label="Workspace name"
        name="workspaceName"
        value={workspaceName}
        onChange={(e) => setWorkspaceName(e.target.value)}
        required
      />
      <TimezoneSelect
        value={timezone}
        onChange={setTimezone}
        hint="Detected from this device. You can change it later in your profile."
      />
      <Button type="submit" loading={saving}>
        Create workspace
      </Button>
      <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
        Working alone? That&apos;s fine — a workspace with just you works exactly the same.
        You can invite people whenever you&apos;re ready.
      </p>
    </form>
    </>
  );
}

export default function OnboardingPage() {
  return (
    <ProtectedRoute>
      <AuthLayout
        eyebrow="Welcome"
        title="Set up your workspace"
        subtitle="A workspace holds your projects, tasks and the people you work with."
      >
        <OnboardingForm />
      </AuthLayout>
    </ProtectedRoute>
  );
}
