// What each workspace role can do, in plain words (mirrors the PRD §8 matrix the server
// enforces). Highlights the viewer's own role.
import { Crown, ShieldCheck, User, type LucideIcon } from "lucide-react";
import { cx } from "@/lib/cx";
import type { WorkspaceRole } from "@/types/models";

const ROLES: { role: WorkspaceRole; title: string; icon: LucideIcon; summary: string; abilities: string[] }[] = [
  {
    role: "owner",
    title: "Owner",
    icon: Crown,
    summary: "One per workspace. Responsible for it.",
    abilities: ["Everything an Admin can do", "Make people Admins or Members", "Rename the workspace", "Hand ownership to someone else"],
  },
  {
    role: "admin",
    title: "Admin",
    icon: ShieldCheck,
    summary: "Helps run the workspace.",
    abilities: ["Edit, assign and delete any task", "Create, archive and restore projects", "Manage labels", "Invite and remove Members"],
  },
  {
    role: "member",
    title: "Member",
    icon: User,
    summary: "Does the work. Sees everything.",
    abilities: ["See every project and task", "Create tasks and subtasks", "Edit tasks they created or are assigned to", "Delete tasks they created"],
  },
];

export default function RoleGuide({ myRole }: { myRole: WorkspaceRole | null }) {
  return (
    <section aria-labelledby="role-guide-heading">
      <h2 id="role-guide-heading" className="mb-1 text-[17px] font-semibold text-ink">
        Who can do what
      </h2>
      <p className="mb-4 text-[14px] text-muted">Roles belong to this workspace — you can be an Admin here and a Member somewhere else.</p>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {ROLES.map(({ role, title, icon: Icon, summary, abilities }) => {
          const isMine = role === myRole;
          return (
            <li key={role} className={cx("rounded-[14px] border p-4", isMine ? "border-forest bg-lime/40" : "border-line bg-surface")}>
              <p className="flex items-center gap-2 text-[15.5px] font-semibold text-ink">
                <Icon size={18} aria-hidden="true" className="text-forest" />
                {title}
                {isMine && <span className="ml-auto rounded-full bg-forest px-2 text-[12px] font-semibold leading-6 text-on-forest">You</span>}
              </p>
              <p className="mt-1 text-[14px] text-muted">{summary}</p>
              <ul className="mt-2.5 flex flex-col gap-1 text-[14px] text-ink">
                {abilities.map((ability) => (
                  <li key={ability} className="flex gap-2">
                    <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-forest" />
                    {ability}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
