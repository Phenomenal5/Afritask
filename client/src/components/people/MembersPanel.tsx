"use client";

// Active members and what the viewer may do to each (PRD §8): the Owner changes roles,
// removes anyone but themselves and hands over ownership; Admins remove Members; Admins
// and Members can leave. The server enforces every rule — these controls only hide what
// it would refuse, and each destructive action says what will happen first.
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Crown, LogOut, UserMinus } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { useWorkspaceResources } from "@/context/WorkspaceResourcesContext";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { changeMemberRole, leaveWorkspace, removeMember, transferOwnership } from "@/lib/services/workspaceService";
import { failureMessage } from "@/lib/errors";
import { ROLE_LABELS } from "@/utils/roles";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import { RoleBadge } from "@/components/ui/Badges";
import type { Member, WorkspaceDetails, WorkspaceRole } from "@/types/models";

const formatJoined = (isoDate: string) => new Date(isoDate).toLocaleDateString(undefined, { month: "short", year: "numeric" });

export default function MembersPanel({ workspace }: { workspace: WorkspaceDetails }) {
  const router = useRouter();
  const { user } = useAuth();
  const { refreshWorkspaces } = useWorkspaces();
  const { reloadWorkspace } = useWorkspaceResources();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState<string | null>(null);

  const myRole = workspace.role;
  const isOwner = myRole === "owner";

  const run = async (busyKey: string, action: () => Promise<unknown>, successMessage: string) => {
    setBusyId(busyKey);
    try {
      await action();
      toast.success(successMessage);
      await Promise.all([refreshWorkspaces(), reloadWorkspace()]);
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't update this person. Nothing was changed. Try again."));
    } finally {
      setBusyId(null);
    }
  };

  const handleRoleChange = (member: Member, role: WorkspaceRole) =>
    run(member.id, () => changeMemberRole(workspace.id, member.id, role), `${member.user.name} is now ${role === "admin" ? "an" : "a"} ${ROLE_LABELS[role]}`);

  const handleRemove = async (member: Member) => {
    const confirmed = await confirm({
      title: `Remove ${member.user.name} from ${workspace.name}?`,
      body: (
        <div className="flex flex-col gap-2">
          <p>They lose access to every project and task here immediately.</p>
          <p>Tasks assigned to them become <strong>Unassigned</strong>. Their past work and history stay, credited to them.</p>
        </div>
      ),
      confirmLabel: "Remove from workspace",
      cancelLabel: "Keep them",
      tone: "danger",
    });
    if (confirmed) run(member.id, () => removeMember(workspace.id, member.id), `${member.user.name} was removed`);
  };

  const handleTransfer = async (member: Member) => {
    const confirmed = await confirm({
      title: `Make ${member.user.name} the Owner?`,
      body: (
        <div className="flex flex-col gap-2">
          <p>There&apos;s only ever one Owner. You&apos;ll become an Admin straight away.</p>
          <p>Only {member.user.name} could make you Owner again.</p>
        </div>
      ),
      confirmLabel: "Transfer ownership",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (confirmed) run(member.id, () => transferOwnership(workspace.id, member.id), `${member.user.name} is now the Owner`);
  };

  const handleLeave = async () => {
    const confirmed = await confirm({
      title: `Leave ${workspace.name}?`,
      body: (
        <div className="flex flex-col gap-2">
          <p>You&apos;ll lose access to its projects and tasks. Tasks assigned to you become Unassigned.</p>
          <p>To come back, someone will need to invite you again.</p>
        </div>
      ),
      confirmLabel: "Leave workspace",
      cancelLabel: "Stay",
      tone: "danger",
    });
    if (!confirmed) return;
    setBusyId("leave");
    try {
      await leaveWorkspace(workspace.id);
      toast.success(`You left ${workspace.name}`);
      // refreshWorkspaces moves the active workspace elsewhere (or to none → onboarding).
      await refreshWorkspaces();
      router.replace("/dashboard");
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't leave the workspace. Try again."));
      setBusyId(null);
    }
  };

  return (
    <section aria-labelledby="members-heading" className="rounded-[14px] border border-line bg-surface p-5 sm:p-6">
      <h2 id="members-heading" className="text-[17px] font-semibold text-ink">
        Members <span className="font-normal text-muted">({workspace.members.length})</span>
      </h2>
      <p className="mb-4 mt-0.5 text-[14px] text-muted">People who have accepted and can see this workspace&apos;s work.</p>

      <ul className="overflow-hidden rounded-[12px] border border-line">
        {workspace.members.map((member) => {
          const isMe = member.user.id === user?.id;
          const canChangeRole = isOwner && member.role !== "owner";
          const canRemove = !isMe && member.role !== "owner" && (isOwner || (myRole === "admin" && member.role === "member"));
          return (
            <li key={member.id} className="flex flex-col gap-3 border-t border-line-soft px-4 py-3.5 first:border-t-0 md:flex-row md:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar user={member.user} size={38} />
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-medium text-ink">
                    {member.user.name} {isMe && <span className="font-normal text-muted">(you)</span>}
                  </p>
                  <p className="truncate text-[13.5px] text-muted">
                    {member.user.email} · joined {formatJoined(member.joinedAt)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canChangeRole ? (
                  <>
                    <label htmlFor={`role-${member.id}`} className="sr-only">
                      Role for {member.user.name}
                    </label>
                    <select
                      id={`role-${member.id}`}
                      value={member.role}
                      disabled={busyId === member.id}
                      onChange={(event) => handleRoleChange(member, event.target.value as WorkspaceRole)}
                      className="field-control field-compact w-auto"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  </>
                ) : (
                  <RoleBadge role={member.role} />
                )}
                {isOwner && member.role !== "owner" && (
                  <Button size="sm" variant="ghost" disabled={busyId === member.id} onClick={() => handleTransfer(member)} icon={<Crown size={15} aria-hidden="true" />}>
                    Make Owner
                  </Button>
                )}
                {canRemove && (
                  <Button size="sm" variant="danger" disabled={busyId === member.id} onClick={() => handleRemove(member)} icon={<UserMinus size={15} aria-hidden="true" />}>
                    Remove
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 border-t border-line-soft pt-4">
        {isOwner ? (
          <p className="text-[14px] text-muted">As the Owner, you can&apos;t leave until you make someone else the Owner.</p>
        ) : (
          <Button size="sm" variant="danger" loading={busyId === "leave"} onClick={handleLeave} icon={<LogOut size={15} aria-hidden="true" />}>
            Leave this workspace
          </Button>
        )}
      </div>
    </section>
  );
}
