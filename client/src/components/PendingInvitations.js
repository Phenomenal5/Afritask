"use client";

// PendingInvitations is the in-app half of PRD journey J2: an existing user sees the
// invitations addressed to their email and can accept or decline without the email link.
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { acceptInvitation, declineInvitation, getMyInvitations } from "@/lib/services/invitationService";
import { ROLE_LABELS } from "@/utils/roles";
import Button from "./Button";

export default function PendingInvitations({ onAccepted }) {
  const { refreshWorkspaces, switchWorkspace } = useWorkspaces();
  const [invitations, setInvitations] = useState([]);
  const [respondingId, setRespondingId] = useState(null);

  const loadInvitations = useCallback(async () => {
    try {
      const res = await getMyInvitations();
      setInvitations(res.data.data.invitations);
    } catch {
      setInvitations([]);
    }
  }, []);

  useEffect(() => {
    loadInvitations();
  }, [loadInvitations]);

  const respond = async (invitation, action) => {
    setRespondingId(invitation.id);
    try {
      if (action === "accept") {
        const res = await acceptInvitation({ invitationId: invitation.id });
        await refreshWorkspaces();
        switchWorkspace(res.data.data.workspaceId);
        toast.success(`You joined ${invitation.workspaceName}`);
        onAccepted?.();
      } else {
        await declineInvitation({ invitationId: invitation.id });
        toast.success("Invitation declined");
      }
      setInvitations((prev) => prev.filter((item) => item.id !== invitation.id));
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not respond to the invitation");
      loadInvitations();
    } finally {
      setRespondingId(null);
    }
  };

  if (invitations.length === 0) return null;

  return (
    <section
      aria-label="Workspace invitations"
      className="rounded-xl p-4 mb-6 flex flex-col gap-3"
      style={{ background: "var(--moss-light)", border: "1px solid var(--line)" }}
    >
      {invitations.map((invitation) => (
        <div key={invitation.id} className="flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm flex-1" style={{ color: "var(--ink)" }}>
            <strong>{invitation.inviterName}</strong> invited you to join{" "}
            <strong>{invitation.workspaceName}</strong> as {ROLE_LABELS[invitation.role]}.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              loading={respondingId === invitation.id}
              disabled={!!respondingId}
              onClick={() => respond(invitation, "accept")}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!!respondingId}
              onClick={() => respond(invitation, "decline")}
            >
              Decline
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
