"use client";

// Invitations addressed to me (PRD J2): accept or decline in the app without the email
// link. Used by Notifications, Overview and onboarding (where joining a team can replace
// creating your own workspace).
import { useState } from "react";
import toast from "react-hot-toast";
import { Mail } from "lucide-react";
import { acceptInvitation, declineInvitation } from "@/lib/services/invitationService";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { failureMessage } from "@/lib/errors";
import { ROLE_LABELS } from "@/utils/roles";
import Button from "@/components/ui/Button";
import type { Invitation } from "@/types/models";

interface InvitationResponsesProps {
  invitations: Invitation[];
  // Called after the server accepted the response (accepted = joined).
  onResolved: (invitation: Invitation, accepted: boolean) => void;
}

const formatExpiry = (isoDate: string) => new Date(isoDate).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default function InvitationResponses({ invitations, onResolved }: InvitationResponsesProps) {
  const { refreshWorkspaces, switchWorkspace } = useWorkspaces();
  const [busy, setBusy] = useState<{ id: string; action: "accept" | "decline" } | null>(null);

  const respond = async (invitation: Invitation, action: "accept" | "decline") => {
    setBusy({ id: invitation.id, action });
    try {
      if (action === "accept") {
        const res = await acceptInvitation({ invitationId: invitation.id });
        await refreshWorkspaces();
        switchWorkspace(res.data.data.workspaceId);
        toast.success(`You joined ${invitation.workspaceName}. It's now your open workspace.`);
      } else {
        await declineInvitation({ invitationId: invitation.id });
        toast.success(`Declined the invitation to ${invitation.workspaceName}`);
      }
      onResolved(invitation, action === "accept");
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't respond to the invitation. Try again."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ul className="flex flex-col gap-3">
      {invitations.map((invitation) => (
        <li key={invitation.id} className="flex flex-col gap-3 rounded-[12px] border border-lime-deep bg-lime/50 p-4 sm:flex-row sm:items-center">
          <span aria-hidden="true" className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface text-forest sm:inline-flex">
            <Mail size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] text-ink">
              <strong>{invitation.inviterName}</strong> invited you to join <strong>{invitation.workspaceName}</strong> as{" "}
              {invitation.role === "admin" ? "an" : "a"} {ROLE_LABELS[invitation.role]}.
            </p>
            <p className="mt-0.5 text-[13.5px] text-muted">
              Accepting adds you as a member and opens that workspace. Expires {formatExpiry(invitation.expiresAt)}.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" loading={busy?.id === invitation.id && busy.action === "accept"} disabled={!!busy} onClick={() => respond(invitation, "accept")}>
              Accept
            </Button>
            <Button size="sm" variant="secondary" loading={busy?.id === invitation.id && busy.action === "decline"} disabled={!!busy} onClick={() => respond(invitation, "decline")}>
              Decline
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
