"use client";

// WorkspaceMembers lists a workspace's members with the actions the viewer's role allows
// (PRD §8): Owner changes roles, removes anyone but themselves and transfers ownership;
// Admin removes Members; Admins and Members can leave. The server enforces every rule —
// these controls only hide what would be refused.
import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaces } from "@/context/WorkspaceContext";
import {
  changeMemberRole,
  leaveWorkspace,
  removeMember,
  transferOwnership,
} from "@/lib/services/workspaceService";
import { ROLE_LABELS } from "@/utils/roles";
import Avatar from "./Avatar";
import Button from "./Button";

export default function WorkspaceMembers({ workspace, onChanged }) {
  const router = useRouter();
  const { user } = useAuth();
  const { refreshWorkspaces } = useWorkspaces();
  const [busyId, setBusyId] = useState(null);

  const myRole = workspace.role;
  const isOwner = myRole === "owner";

  const run = async (busyKey, action, successMessage) => {
    setBusyId(busyKey);
    try {
      await action();
      if (successMessage) toast.success(successMessage);
      await refreshWorkspaces();
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || "Something went wrong");
    } finally {
      setBusyId(null);
    }
  };

  const handleRoleChange = (member, role) =>
    run(member.id, () => changeMemberRole(workspace.id, member.id, role), `${member.user.name} is now ${ROLE_LABELS[role]}`);

  const handleRemove = (member) => {
    if (!window.confirm(`Remove ${member.user.name} from ${workspace.name}? They lose access immediately; their past work stays.`)) return;
    run(member.id, () => removeMember(workspace.id, member.id), `${member.user.name} was removed`);
  };

  const handleTransfer = (member) => {
    if (!window.confirm(`Make ${member.user.name} the Owner of ${workspace.name}? You'll become an Admin, and only they can undo this.`)) return;
    run(member.id, () => transferOwnership(workspace.id, member.id), `${member.user.name} is now the Owner`);
  };

  const handleLeave = async () => {
    if (!window.confirm(`Leave ${workspace.name}? You'll lose access to its projects and tasks.`)) return;
    setBusyId("leave");
    try {
      await leaveWorkspace(workspace.id);
      toast.success(`You left ${workspace.name}`);
      // refreshWorkspaces moves the active workspace elsewhere (or to none → onboarding).
      await refreshWorkspaces();
      router.replace("/dashboard");
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not leave the workspace");
      setBusyId(null);
    }
  };

  return (
    <section className="p-5 rounded-xl" style={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }}>
      <h2 className="font-display text-lg mb-4" style={{ color: "var(--ink)" }}>
        Members ({workspace.members.length})
      </h2>
      <ul className="flex flex-col">
        {workspace.members.map((member) => {
          const isMe = member.user.id === user?.id;
          const canChangeRole = isOwner && member.role !== "owner";
          const canRemove = !isMe && member.role !== "owner" && (isOwner || (myRole === "admin" && member.role === "member"));
          return (
            <li
              key={member.id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 py-3"
              style={{ borderTop: "1px solid var(--line-soft)" }}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Avatar user={member.user} size={34} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "var(--ink)" }}>
                    {member.user.name} {isMe && <span style={{ color: "var(--ink-soft)" }}>(you)</span>}
                  </p>
                  <p className="text-xs truncate" style={{ color: "var(--ink-soft)" }}>
                    {member.user.email}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canChangeRole ? (
                  <select
                    aria-label={`Role for ${member.user.name}`}
                    value={member.role}
                    disabled={busyId === member.id}
                    onChange={(e) => handleRoleChange(member, e.target.value)}
                    className="text-xs px-2.5 py-1.5 rounded-md outline-none"
                    style={{ background: "var(--paper-raised)", border: "1px solid var(--line)", color: "var(--ink)" }}
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                ) : (
                  <span
                    className="text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{ background: "var(--moss-light)", color: "var(--ink)" }}
                  >
                    {ROLE_LABELS[member.role]}
                  </span>
                )}
                {isOwner && member.role !== "owner" && (
                  <Button size="sm" variant="secondary" disabled={busyId === member.id} onClick={() => handleTransfer(member)}>
                    Make owner
                  </Button>
                )}
                {canRemove && (
                  <Button size="sm" variant="secondary" disabled={busyId === member.id} onClick={() => handleRemove(member)}>
                    Remove
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--line-soft)" }}>
        {isOwner ? (
          <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
            As the Owner you can&apos;t leave until you make someone else the Owner.
          </p>
        ) : (
          <Button size="sm" variant="secondary" loading={busyId === "leave"} onClick={handleLeave}>
            Leave workspace
          </Button>
        )}
      </div>
    </section>
  );
}
