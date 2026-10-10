"use client";

// Invitation landing page — where every emailed invitation link opens (PRD J2/J3).
// Public on purpose: the recipient may not have an account yet. Opening it grants
// nothing; only the invited email, signed in and verified, can accept.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Mail, UserRound } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { acceptInvitation, declineInvitation, previewInvitation } from "@/lib/services/invitationService";
import { failureMessage } from "@/lib/errors";
import { clearPendingInvite, savePendingInvite } from "@/utils/pendingInvite";
import { ROLE_LABELS } from "@/utils/roles";
import AuthLayout from "@/components/auth/AuthLayout";
import FormAlert from "@/components/auth/FormAlert";
import Button, { ButtonLink } from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import type { Invitation } from "@/types/models";

const FINISHED_MESSAGES: Record<string, string> = {
  accepted: "This invitation has already been accepted. If that was you, the workspace is in your workspace switcher.",
  declined: "This invitation was declined, so it can't be used any more.",
  revoked: "The workspace withdrew this invitation. Ask them to send a new one if you still need access.",
  expired: "This invitation has expired. Ask the person who invited you to send a new one.",
};

const ROLE_MEANING: Record<string, string> = {
  admin: "Admins can manage projects, labels and Members, and edit any task.",
  member: "Members see every project and task, and work on what they create or are assigned.",
};

function InvitationAside({ invitation }: { invitation: Invitation }) {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-lime">You&apos;re invited to</p>
      <p className="mt-2 font-display text-[44px] font-semibold leading-[1.05] tracking-tight text-sidebar-text">{invitation.workspaceName}</p>
      <dl className="mt-8 flex max-w-sm flex-col gap-4 text-[15px]">
        <div className="flex items-start gap-3">
          <UserRound size={19} aria-hidden="true" className="mt-0.5 text-harvest" />
          <div>
            <dt className="text-sidebar-muted">Invited by</dt>
            <dd className="font-semibold text-sidebar-text">{invitation.inviterName}</dd>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Mail size={19} aria-hidden="true" className="mt-0.5 text-harvest" />
          <div>
            <dt className="text-sidebar-muted">For</dt>
            <dd className="font-semibold text-sidebar-text">{invitation.email}</dd>
          </div>
        </div>
      </dl>
      <p className="mt-8 max-w-sm text-[15px] leading-relaxed text-sidebar-muted">
        As {invitation.role === "admin" ? "an" : "a"} <strong className="text-sidebar-text">{ROLE_LABELS[invitation.role]}</strong>: {ROLE_MEANING[invitation.role]}
      </p>
    </div>
  );
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { user, authLoading, logout } = useAuth();
  const { refreshWorkspaces, switchWorkspace } = useWorkspaces();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [responding, setResponding] = useState<"accept" | "decline" | null>(null);
  const [respondError, setRespondError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    previewInvitation(token)
      .then((res) => setInvitation(res.data.data.invitation))
      .catch((error) => setLoadError(failureMessage(error, "This invitation link isn't valid.")));
  }, [token]);

  // Signed out: remember the link so sign-up → verify (new tab) → sign-in returns here.
  useEffect(() => {
    if (!authLoading && !user && token && invitation?.status === "pending") savePendingInvite(token);
  }, [authLoading, user, token, invitation]);

  const respond = async (action: "accept" | "decline") => {
    if (!invitation) return;
    setResponding(action);
    setRespondError(null);
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
        toast.success("Invitation declined. Nothing was shared with you.");
        router.replace(user ? "/dashboard" : "/login");
      }
    } catch (error) {
      setRespondError(failureMessage(error, "Couldn't respond to the invitation. Try again."));
      setResponding(null);
    }
  };

  if (loadError) {
    return (
      <AuthLayout eyebrow="Invitation" title="This link doesn't work">
        <title>Invitation · Afritask</title>
        <div className="flex flex-col gap-5">
          <FormAlert>{loadError} If you were sent more than one email, use the link in the newest one — resending replaces older links.</FormAlert>
          <ButtonLink href={user ? "/dashboard" : "/login"} variant="secondary" size="lg" full>
            {user ? "Go to my workspace" : "Go to sign in"}
          </ButtonLink>
        </div>
      </AuthLayout>
    );
  }

  if (!invitation || authLoading) {
    return (
      <AuthLayout eyebrow="Invitation" title="Opening your invitation…">
        <title>Invitation · Afritask</title>
        <p role="status" className="flex items-center gap-3 text-[15px] text-muted">
          <Spinner />
          This only takes a moment.
        </p>
      </AuthLayout>
    );
  }

  const title = `Join ${invitation.workspaceName}`;
  const aside = <InvitationAside invitation={invitation} />;
  const summary = `${invitation.inviterName} invited ${invitation.email} to join as ${invitation.role === "admin" ? "an" : "a"} ${ROLE_LABELS[invitation.role]}.`;

  if (invitation.status !== "pending") {
    return (
      <AuthLayout eyebrow="Invitation" title={title} aside={aside}>
        <title>{`${title} · Afritask`}</title>
        <div className="flex flex-col gap-5">
          <FormAlert tone="info">{FINISHED_MESSAGES[invitation.status]}</FormAlert>
          <ButtonLink href={user ? "/dashboard" : "/login"} variant="secondary" size="lg" full>
            Continue
          </ButtonLink>
        </div>
      </AuthLayout>
    );
  }

  // Signed out: sign in or create an account WITH THE INVITED EMAIL, then come back here.
  if (!user) {
    return (
      <AuthLayout eyebrow="You're invited" title={title} description={summary} aside={aside}>
        <title>{`${title} · Afritask`}</title>
        <div className="flex flex-col gap-5">
          <p className="text-[15px] leading-relaxed text-ink">
            To respond, sign in or create an account with <strong>{invitation.email}</strong>. We&apos;ll bring you back to this invitation
            afterwards — even after verifying your email.
          </p>
          <div className="flex flex-col gap-3">
            <ButtonLink href={`/signup?email=${encodeURIComponent(invitation.email)}`} size="lg" full>
              Create an account
            </ButtonLink>
            <ButtonLink href="/login" variant="secondary" size="lg" full>
              I already have an account
            </ButtonLink>
          </div>
        </div>
      </AuthLayout>
    );
  }

  // Signed in as someone else: this account can't use the invitation.
  if (user.email.toLowerCase() !== invitation.email.toLowerCase()) {
    return (
      <AuthLayout eyebrow="You're invited" title={title} description={summary} aside={aside}>
        <title>{`${title} · Afritask`}</title>
        <div className="flex flex-col gap-5">
          <FormAlert tone="info">
            You&apos;re signed in as <strong>{user.email}</strong>, but this invitation is for <strong>{invitation.email}</strong>. Only that address can
            accept it.
          </FormAlert>
          <Button
            size="lg"
            full
            onClick={async () => {
              await logout();
              // logout clears any remembered invite — keep THIS one for the right account.
              savePendingInvite(token);
            }}
          >
            Sign out and switch account
          </Button>
          <Link href="/dashboard" className="self-center rounded text-[15px] font-medium text-forest underline-offset-4 hover:underline">
            Back to my workspace
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout eyebrow="You're invited" title={title} description={summary} aside={aside}>
      <title>{`${title} · Afritask`}</title>
      <div className="flex flex-col gap-5">
        {respondError && <FormAlert>{respondError}</FormAlert>}
        <p className="text-[15px] leading-relaxed text-ink">
          Accepting gives you access to {invitation.workspaceName}&apos;s projects and tasks, and opens it right away. Your other workspaces stay as
          they are, and you can leave at any time.
        </p>
        <div className="flex flex-col gap-3">
          <Button size="lg" full loading={responding === "accept"} disabled={!!responding} onClick={() => respond("accept")}>
            Accept and join
          </Button>
          <Button variant="secondary" size="lg" full loading={responding === "decline"} disabled={!!responding} onClick={() => respond("decline")}>
            Decline
          </Button>
        </div>
      </div>
    </AuthLayout>
  );
}
