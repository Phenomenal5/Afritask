"use client";

// WorkspaceInvitations: Owners/Admins invite people by email and manage pending invitations.
// The server enforces who may offer which role; the form just hides options they can't use.
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  getWorkspaceInvitations,
  inviteToWorkspace,
  resendInvitation,
  revokeInvitation,
} from "@/lib/services/invitationService";
import { ROLE_LABELS } from "@/utils/roles";
import FormField from "./FormField";
import Button from "./Button";

const DELIVERY_LABELS = { pending: "Sending…", sent: "Email sent", failed: "Email failed — resend" };

const formatDate = (isoDate) => new Date(isoDate).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default function WorkspaceInvitations({ workspaceId, myRole }) {
  // Owner can invite Admins or Members; an Admin only Members (PRD §8).
  const invitableRoles = myRole === "owner" ? ["member", "admin"] : ["member"];
  const [invitations, setInvitations] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const loadInvitations = useCallback(async () => {
    const res = await getWorkspaceInvitations(workspaceId);
    setInvitations(res.data.data.invitations);
  }, [workspaceId]);

  useEffect(() => {
    loadInvitations().catch(() => setInvitations([]));
  }, [loadInvitations]);

  const handleInvite = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const res = await inviteToWorkspace(workspaceId, { email, role });
      const { deliveryStatus } = res.data.data.invitation;
      if (deliveryStatus === "failed") {
        toast.error("Invitation saved, but the email couldn't be sent. Try Resend.");
      } else {
        toast.success(`Invitation sent to ${email}`);
      }
      setEmail("");
      loadInvitations();
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not send the invitation");
    } finally {
      setSending(false);
    }
  };

  const act = async (invitation, action) => {
    setBusyId(invitation.id);
    try {
      if (action === "resend") {
        const res = await resendInvitation(invitation.id);
        toast[res.data.data.invitation.deliveryStatus === "failed" ? "error" : "success"](
          res.data.data.invitation.deliveryStatus === "failed" ? "The email still couldn't be sent" : "Invitation resent"
        );
      } else {
        await revokeInvitation(invitation.id);
        toast.success("Invitation revoked");
      }
      loadInvitations();
    } catch (err) {
      toast.error(err.response?.data?.message || "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="p-5 rounded-xl mb-6" style={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }}>
      <h2 className="font-display text-lg mb-4" style={{ color: "var(--ink)" }}>
        Invite people
      </h2>
      <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3 sm:items-end mb-5">
        <div className="flex-1">
          <FormField
            label="Email"
            name="inviteEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@example.com"
            required
          />
        </div>
        {invitableRoles.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="inviteRole" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Role
            </label>
            <select
              id="inviteRole"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="px-3.5 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: "var(--paper-raised)", border: "1px solid var(--line)", color: "var(--ink)" }}
            >
              {invitableRoles.map((invitableRole) => (
                <option key={invitableRole} value={invitableRole}>
                  {ROLE_LABELS[invitableRole]}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" loading={sending}>
          Send invite
        </Button>
      </form>

      {invitations.length > 0 && (
        <>
          <h3 className="text-sm font-medium mb-2" style={{ color: "var(--ink)" }}>
            Pending invitations
          </h3>
          <ul className="flex flex-col">
            {invitations.map((invitation) => {
              // Admins can't manage Admin invitations — the server would refuse anyway.
              const canManage = invitableRoles.includes(invitation.role);
              return (
                <li
                  key={invitation.id}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 py-3"
                  style={{ borderTop: "1px solid var(--line-soft)" }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: "var(--ink)" }}>
                      {invitation.email}{" "}
                      <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                        · {ROLE_LABELS[invitation.role]}
                      </span>
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: invitation.deliveryStatus === "failed" || invitation.status === "expired" ? "var(--error)" : "var(--ink-soft)" }}
                    >
                      {invitation.status === "expired" ? "Expired" : DELIVERY_LABELS[invitation.deliveryStatus]} · invited by{" "}
                      {invitation.inviterName} · {invitation.status === "expired" ? "expired" : "expires"} {formatDate(invitation.expiresAt)}
                    </p>
                  </div>
                  {canManage && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" disabled={busyId === invitation.id} onClick={() => act(invitation, "resend")}>
                        Resend
                      </Button>
                      <Button size="sm" variant="secondary" disabled={busyId === invitation.id} onClick={() => act(invitation, "revoke")}>
                        Revoke
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
