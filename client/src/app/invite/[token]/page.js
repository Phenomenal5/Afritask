"use client";

// Invitation landing page — where every emailed invitation link opens (PRD J2/J3).
// Public on purpose: the recipient may not have an account yet. Opening it grants
// nothing; only the invited email, signed in and verified, can accept.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaces } from "@/context/WorkspaceContext";
import AuthLayout from "@/components/AuthLayout";
import Button from "@/components/Button";
import { acceptInvitation, declineInvitation, previewInvitation } from "@/lib/services/invitationService";
import { clearPendingInvite, savePendingInvite } from "@/utils/pendingInvite";
import { ROLE_LABELS } from "@/utils/roles";

const FINISHED_MESSAGES = {
  accepted: "This invitation has already been accepted.",
  declined: "This invitation was declined.",
  revoked: "This invitation was withdrawn by the workspace.",
  expired: "This invitation has expired. Ask the person who invited you to send a new one.",
};

export default function InvitePage() {
  const { token } = useParams();
  const router = useRouter();
  const { user, authLoading, logout } = useAuth();
  const { refreshWorkspaces, switchWorkspace } = useWorkspaces();
  const [invitation, setInvitation] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [responding, setResponding] = useState(null); // "accept" | "decline" | null

  useEffect(() => {
    if (!token) return;
    previewInvitation(token)
      .then((res) => setInvitation(res.data.data.invitation))
      .catch((err) => setLoadError(err.response?.data?.message || "This invitation link is invalid."));
  }, [token]);

  // Signed out: remember the link so sign-up → verify (new tab) → sign-in returns here.
  useEffect(() => {
    if (!authLoading && !user && token && invitation?.status === "pending") savePendingInvite(token);
  }, [authLoading, user, token, invitation]);

  const respond = async (action) => {
    setResponding(action);
    try {
      if (action === "accept") {
        const res = await acceptInvitation({ token });
        clearPendingInvite();
        await refreshWorkspaces();
        switchWorkspace(res.data.data.workspaceId);
        toast.success(`Welcome to ${invitation.workspaceName}`);
        router.replace("/dashboard");
      } else {
        await declineInvitation({ token });
        clearPendingInvite();
        toast.success("Invitation declined");
        router.replace(user ? "/dashboard" : "/login");
      }
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not respond to the invitation");
      setResponding(null);
    }
  };

  if (loadError) {
    return (
      <AuthLayout eyebrow="Invitation" title="Link not valid">
        <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
          {loadError} If someone resent your invitation, use the link in the newest email.
        </p>
        <Button full variant="secondary" onClick={() => router.push("/login")}>
          Go to sign in
        </Button>
      </AuthLayout>
    );
  }

  if (!invitation || authLoading) {
    return (
      <AuthLayout eyebrow="Invitation" title="Opening your invitation...">
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          Hang tight, this only takes a moment.
        </p>
      </AuthLayout>
    );
  }

  const roleLabel = ROLE_LABELS[invitation.role];
  const title = `Join ${invitation.workspaceName}`;
  const subtitle = `${invitation.inviterName} invited ${invitation.email} to join as ${roleLabel === "Admin" ? "an" : "a"} ${roleLabel}.`;

  if (invitation.status !== "pending") {
    return (
      <AuthLayout eyebrow="Invitation" title={title}>
        <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
          {FINISHED_MESSAGES[invitation.status]}
        </p>
        <Button full variant="secondary" onClick={() => router.push(user ? "/dashboard" : "/login")}>
          Continue
        </Button>
      </AuthLayout>
    );
  }

  // Signed out: sign in or create an account WITH THE INVITED EMAIL, then come back here.
  if (!user) {
    return (
      <AuthLayout eyebrow="You're invited" title={title} subtitle={subtitle}>
        <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
          Sign in or create an account with <strong>{invitation.email}</strong> to respond.
          We&apos;ll bring you back to this invitation afterwards.
        </p>
        <div className="flex flex-col gap-3">
          <Button full onClick={() => router.push(`/signup?email=${encodeURIComponent(invitation.email)}`)}>
            Create an account
          </Button>
          <Button full variant="secondary" onClick={() => router.push("/login")}>
            I already have an account
          </Button>
        </div>
      </AuthLayout>
    );
  }

  // Signed in as someone else: the invitation can't be used from this account.
  if (user.email.toLowerCase() !== invitation.email) {
    return (
      <AuthLayout eyebrow="You're invited" title={title} subtitle={subtitle}>
        <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
          You&apos;re signed in as <strong>{user.email}</strong>, but this invitation is for{" "}
          <strong>{invitation.email}</strong>. Sign out and use that email instead.
        </p>
        <Button
          full
          variant="secondary"
          onClick={async () => {
            await logout();
            // logout clears any remembered invite — keep THIS one for the right account.
            savePendingInvite(token);
          }}
        >
          Sign out and switch account
        </Button>
        <p className="text-xs mt-4" style={{ color: "var(--ink-soft)" }}>
          <Link href="/dashboard" style={{ color: "var(--moss)" }}>
            Back to my workspace
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout eyebrow="You're invited" title={title} subtitle={subtitle}>
      <p className="text-sm mb-6" style={{ color: "var(--ink-soft)" }}>
        Accept to see the workspace&apos;s projects and tasks. You can leave a workspace at any time.
      </p>
      <div className="flex flex-col gap-3">
        <Button full loading={responding === "accept"} disabled={!!responding} onClick={() => respond("accept")}>
          Accept invitation
        </Button>
        <Button
          full
          variant="secondary"
          loading={responding === "decline"}
          disabled={!!responding}
          onClick={() => respond("decline")}
        >
          Decline
        </Button>
      </div>
    </AuthLayout>
  );
}
