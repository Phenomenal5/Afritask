"use client";

// Tick the workspaces a performance view or a share link covers. Each shows whether you own
// it or are a member or Admin there. "All" and "Ones I own" just tick boxes; you can adjust
// before going on.
import type { WorkspaceSummary } from "@/types/models";

const ROLE_WORDS = { owner: "You own it", admin: "Admin", member: "Member" } as const;

interface WorkspacePickerProps {
  workspaces: WorkspaceSummary[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
}

export default function WorkspacePicker({ workspaces, selectedIds, onChange }: WorkspacePickerProps) {
  const owned = workspaces.filter((workspace) => workspace.role === "owner").map((workspace) => workspace.id);
  const toggle = (workspaceId: string) =>
    onChange(selectedIds.includes(workspaceId) ? selectedIds.filter((id) => id !== workspaceId) : [...selectedIds, workspaceId]);
  const quickPick = "inline-flex min-h-9 cursor-pointer items-center rounded-full border border-line px-3 text-[13.5px] font-medium text-ink hover:bg-surface-muted";

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-[14px] font-medium text-ink">Workspaces</legend>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={quickPick} onClick={() => onChange(workspaces.map((workspace) => workspace.id))}>
          All
        </button>
        {owned.length > 0 && (
          <button type="button" className={quickPick} onClick={() => onChange(owned)}>
            Ones I own
          </button>
        )}
        <button type="button" className={quickPick} onClick={() => onChange([])}>
          Clear
        </button>
      </div>
      <ul className="max-h-64 divide-y divide-line-soft overflow-y-auto rounded-[12px] border border-line">
        {workspaces.map((workspace) => (
          <li key={workspace.id}>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3.5 py-2 hover:bg-surface-muted/60">
              <input type="checkbox" className="h-4 w-4 shrink-0 accent-[var(--forest)]" checked={selectedIds.includes(workspace.id)} onChange={() => toggle(workspace.id)} />
              <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink">{workspace.name}</span>
              <span className="shrink-0 text-[13px] text-muted">{ROLE_WORDS[workspace.role]}</span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

// "every workspace" / "Team Space" / "3 workspaces", for headings and notes.
export const describeSelection = (selectedIds: string[], workspaces: WorkspaceSummary[]) => {
  if (selectedIds.length === 0 || selectedIds.length === workspaces.length) return "across all your workspaces";
  if (selectedIds.length === 1) return `in ${workspaces.find((workspace) => workspace.id === selectedIds[0])?.name ?? "one workspace"}`;
  return `across ${selectedIds.length} of your workspaces`;
};
