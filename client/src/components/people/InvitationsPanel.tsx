"use client";

// Owners/Admins invite people by email and track each invitation's real state: whether it
// is still pending or expired, and whether the email was actually delivered (pending →
// sent / failed). Owner may invite Admins or Members; Admins only Members (PRD §8). The
// server enforces both; the form only offers what would be accepted.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { CircleAlert, Clock, MailCheck, MailX, RotateCw, Send, X } from "lucide-react";
import { getWorkspaceInvitations, inviteToWorkspace, resendInvitation, revokeInvitation } from "@/lib/services/invitationService";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { describeFailure, failureMessage, type Failure } from "@/lib/errors";
import { ROLE_LABELS } from "@/utils/roles";
import Button from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { FailurePanel } from "@/components/ui/States";
import { RoleBadge } from "@/components/ui/Badges";
import type { Invitation, WorkspaceRole } from "@/types/models";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const formatDate = (isoDate: string) => new Date(isoDate).toLocaleDateString(undefined, { day: "numeric", month: "short" });

function DeliveryState({ invitation }: { invitation: Invitation }) {
  if (invitation.status === "expired") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-brick">
        <Clock size={14} aria-hidden="true" />
        Expired {formatDate(invitation.expiresAt)}. Resend to give them a new link
      </span>
    );
  }
  if (invitation.deliveryStatus === "failed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-brick">
        <MailX size={14} aria-hidden="true" />
        Email couldn&apos;t be delivered. Resend it, or check the address
      </span>
    );
  }
  if (invitation.deliveryStatus === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13.5px] text-muted">
        <Clock size={14} aria-hidden="true" />
        Sending the email...
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[13.5px] text-muted">
      <MailCheck size={14} aria-hidden="true" className="text-done" />
      Email sent · waiting for them to accept · expires {formatDate(invitation.expiresAt)}
    </span>
  );
}

export default function InvitationsPanel({ workspaceId, myRole, autoFocus = false }: { workspaceId: string; myRole: WorkspaceRole; autoFocus?: boolean }) {
  const invitableRoles: WorkspaceRole[] = myRole === "owner" ? ["member", "admin"] : ["member"];
  const confirm = useConfirm();
  const online = useOnlineStatus();
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [loadFailure, setLoadFailure] = useState<Failure | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("member");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const loadInvitations = useCallback(async () => {
    try {
      const response = await getWorkspaceInvitations(workspaceId);
      setInvitations(response.data.data.invitations);
      setLoadFailure(null);
    } catch (error) {
      setLoadFailure(describeFailure(error, "Couldn't load invitations."));
    }
  }, [workspaceId]);

  useEffect(() => {
    setInvitations(null);
    loadInvitations();
  }, [loadInvitations]);

  useEffect(() => {
    if (autoFocus) emailRef.current?.focus();
  }, [autoFocus]);

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setEmailError("Enter a full email address, like name@example.com.");
      emailRef.current?.focus();
      return;
    }
    setSending(true);
    try {
      const response = await inviteToWorkspace(workspaceId, { email: trimmedEmail, role });
      if (response.data.data.invitation.deliveryStatus === "failed") {
        toast.error(`Invitation saved, but the email to ${trimmedEmail} couldn't be sent. Use Resend below.`);
      } else {
        toast.success(`Invitation sent to ${trimmedEmail}`);
      }
      setEmail("");
      loadInvitations();
    } catch (error) {
      // Field-level when it's about the address (already a member, already invited…).
      setEmailError(failureMessage(error, "Couldn't send the invitation."));
    } finally {
      setSending(false);
    }
  };

  const handleResend = async (invitation: Invitation) => {
    setBusyId(invitation.id);
    try {
      const response = await resendInvitation(invitation.id);
      if (response.data.data.invitation.deliveryStatus === "failed") toast.error(`The email to ${invitation.email} still couldn't be sent.`);
      else toast.success(`New invitation sent to ${invitation.email}. The old link no longer works.`);
      loadInvitations();
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't resend the invitation."));
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = async (invitation: Invitation) => {
    const confirmed = await confirm({
      title: `Withdraw the invitation to ${invitation.email}?`,
      body: <p>Their link stops working straight away. You can invite them again later.</p>,
      confirmLabel: "Withdraw invitation",
      cancelLabel: "Keep it",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusyId(invitation.id);
    try {
      await revokeInvitation(invitation.id);
      toast.success(`Invitation to ${invitation.email} withdrawn`);
      loadInvitations();
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't withdraw the invitation."));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-labelledby="invite-heading" className="rounded-[14px] border border-line bg-surface p-5 sm:p-6">
      <h2 id="invite-heading" className="text-[17px] font-semibold text-ink">
        Invite people
      </h2>
      <p className="mb-4 mt-0.5 text-[14px] text-muted">
        They get an email link. Nothing is shared with them until they accept using that exact email address.
      </p>

      <form onSubmit={handleInvite} noValidate className="flex flex-col gap-3 md:flex-row md:items-start">
        <TextField
          ref={emailRef}
          wrapperClassName="flex-1"
          label="Email address"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setEmailError(null);
          }}
          placeholder="teammate@example.com"
          error={emailError}
        />
        {invitableRoles.length > 1 ? (
          <SelectField label="Role" wrapperClassName="md:w-40" value={role} onChange={(event) => setRole(event.target.value as WorkspaceRole)}>
            {invitableRoles.map((invitableRole) => (
              <option key={invitableRole} value={invitableRole}>
                {ROLE_LABELS[invitableRole]}
              </option>
            ))}
          </SelectField>
        ) : (
          <p className="text-[14px] text-muted md:mt-9">Joins as a Member</p>
        )}
        <Button type="submit" loading={sending} disabled={!online} className="md:mt-[27px]" icon={<Send size={16} aria-hidden="true" />}>
          Send invite
        </Button>
      </form>

      <h3 className="mb-2 mt-7 text-[15px] font-semibold text-ink">Pending invitations</h3>
      {loadFailure ? (
        <FailurePanel compact failure={loadFailure} onRetry={loadInvitations} />
      ) : invitations === null ? (
        <span role="status" aria-label="Loading invitations" className="skeleton block h-14" />
      ) : invitations.length === 0 ? (
        <p className="rounded-[10px] bg-surface-muted px-4 py-3 text-[14px] text-muted">No invitations waiting. People you invite appear here until they accept.</p>
      ) : (
        <ul className="overflow-hidden rounded-[12px] border border-line">
          {invitations.map((invitation) => {
            // Admins can't manage Admin invitations — the server would refuse anyway.
            const canManage = invitableRoles.includes(invitation.role);
            return (
              <li key={invitation.id} className="flex flex-col gap-3 border-t border-line-soft px-4 py-3.5 first:border-t-0 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[15px] text-ink">
                    <span className="truncate font-medium">{invitation.email}</span>
                    <RoleBadge role={invitation.role} />
                    <span className="rounded-full border border-dashed border-line px-2 text-[12px] font-medium leading-5 text-muted">Not a member yet</span>
                  </p>
                  <p className="mt-1">
                    <DeliveryState invitation={invitation} />
                  </p>
                  <p className="text-[13px] text-muted">Invited by {invitation.inviterName}</p>
                </div>
                {canManage ? (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="secondary" disabled={busyId === invitation.id || !online} onClick={() => handleResend(invitation)} icon={<RotateCw size={15} aria-hidden="true" />}>
                      Resend
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busyId === invitation.id || !online} onClick={() => handleRevoke(invitation)} icon={<X size={15} aria-hidden="true" />}>
                      Withdraw
                    </Button>
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 text-[13px] text-muted">
                    <CircleAlert size={14} aria-hidden="true" />
                    Only the Owner manages Admin invitations
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
