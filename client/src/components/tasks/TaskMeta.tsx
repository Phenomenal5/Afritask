// Small pieces of task metadata shared by list rows, board cards and the overview.
import { CornerDownRight, Folder, ListTree, UserRound } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { labelStyle } from "@/utils/labels";
import type { Task } from "@/types/models";

// Explicit "Unassigned" rather than a blank, so it's clear nobody owns it.
export function AssigneeChip({ task, compact = false }: { task: Task; compact?: boolean }) {
  if (!task.assignee) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted whitespace-nowrap">
        <span aria-hidden="true" className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-line">
          <UserRound size={13} />
        </span>
        Unassigned
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-ink">
      <Avatar user={task.assignee.user} size={24} />
      {!compact && <span className="truncate">{task.assignee.user.name}</span>}
      {compact && <span className="sr-only">Assigned to {task.assignee.user.name}</span>}
    </span>
  );
}

export function ProjectTag({ task }: { task: Task }) {
  if (!task.project) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-[13px] text-muted">
      <Folder size={13} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{task.project.name}</span>
      {task.project.state === "archived" && <span>(archived)</span>}
    </span>
  );
}

export function ParentContext({ task }: { task: Task }) {
  if (!task.parent) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-[13px] text-muted">
      <CornerDownRight size={13} aria-hidden="true" className="shrink-0" />
      <span className="truncate">Subtask of {task.parent.title}</span>
    </span>
  );
}

export function SubtaskProgress({ task }: { task: Task }) {
  if (!task.subtaskCounts?.total) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[13px] text-muted whitespace-nowrap">
      <ListTree size={13} aria-hidden="true" />
      {task.subtaskCounts.completed}/{task.subtaskCounts.total}
      <span className="sr-only"> subtasks completed</span>
    </span>
  );
}

export function LabelChips({ task, max = 3 }: { task: Task; max?: number }) {
  const labels = task.labels ?? [];
  if (labels.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {labels.slice(0, max).map((label) => (
        <span key={label.id} className="rounded-full px-2 text-[12px] font-medium leading-5" style={labelStyle(label.color)}>
          {label.name}
        </span>
      ))}
      {labels.length > max && <span className="text-[12px] text-muted">+{labels.length - max}</span>}
    </span>
  );
}
