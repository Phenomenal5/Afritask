// Status, priority, due-date and role badges. Every badge pairs its colour with an icon
// AND words — colour alone never carries meaning (WCAG 1.4.1).
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarX2,
  Circle,
  CircleCheck,
  CircleDot,
  CircleEllipsis,
  Minus,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { describeStart } from "@/utils/startFields";
import { cx } from "@/lib/cx";
import { PRIORITY_STYLES, STATUS_LABELS, describeDue } from "@/utils/taskMeta";
import { PROJECT_STATE_LABELS } from "@/utils/projects";
import { ROLE_LABELS } from "@/utils/roles";
import type { ProjectState, Task, TaskPriority, TaskStatus, WorkspaceRole } from "@/types/models";

const PILL = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-medium leading-6 whitespace-nowrap";

export const STATUS_META: Record<TaskStatus, { icon: LucideIcon; color: string; tint: string }> = {
  todo: { icon: Circle, color: "var(--status-todo)", tint: "var(--status-todo-tint)" },
  in_progress: { icon: CircleDot, color: "var(--status-progress)", tint: "var(--status-progress-tint)" },
  in_review: { icon: CircleEllipsis, color: "var(--status-review)", tint: "var(--status-review-tint)" },
  completed: { icon: CircleCheck, color: "var(--status-done)", tint: "var(--status-done-tint)" },
};

export function StatusBadge({ status, className }: { status: TaskStatus; className?: string }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span className={cx(PILL, className)} style={{ color: meta.color, background: meta.tint }}>
      <Icon size={14} aria-hidden="true" strokeWidth={2.25} />
      {STATUS_LABELS[status]}
    </span>
  );
}

const PRIORITY_ICONS: Record<TaskPriority, LucideIcon> = {
  low: ArrowDown,
  medium: Minus,
  high: ArrowUp,
  urgent: TriangleAlert,
};

export function PriorityBadge({ priority, subtle = false }: { priority: TaskPriority; subtle?: boolean }) {
  const style = PRIORITY_STYLES[priority];
  const Icon = PRIORITY_ICONS[priority];
  return (
    <span
      className={cx(PILL, subtle && "bg-transparent! px-0")}
      style={{ color: style.color, background: subtle ? undefined : style.bg }}
    >
      <Icon size={14} aria-hidden="true" strokeWidth={2.25} />
      <span>
        {style.label}
        <span className="sr-only"> priority</span>
      </span>
    </span>
  );
}

// "No due date" is shown explicitly rather than leaving a blank (the spec asks for it).
// `now` is null during the server render; the label then waits for hydration.
// "Starts tomorrow" for To do work with a future start — nothing once it's begun.
export function StartLabel({ task, now }: { task: Task; now: Date | null }) {
  if (!now) return null;
  const text = describeStart(task, now);
  if (!text) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap text-forest">
      <CalendarClock size={14} aria-hidden="true" />
      {text}
    </span>
  );
}

export function DueLabel({ task, now, quietWhenEmpty = false }: { task: Task; now: Date | null; quietWhenEmpty?: boolean }) {
  if (!task.dueAt) {
    if (quietWhenEmpty) return null;
    return (
      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted whitespace-nowrap">
        <CalendarX2 size={14} aria-hidden="true" />
        No due date
      </span>
    );
  }
  if (!now) return <span className="inline-block h-4 w-16 skeleton" aria-hidden="true" />;
  const due = describeDue(task, now);
  if (!due) return null;
  return (
    <span className={cx("inline-flex items-center gap-1.5 text-[13px] whitespace-nowrap", due.overdue ? "font-semibold text-brick" : "text-muted")}>
      {due.overdue ? <TriangleAlert size={14} aria-hidden="true" /> : <CalendarClock size={14} aria-hidden="true" />}
      {due.overdue ? due.text : `Due ${due.text}`}
    </span>
  );
}

const PROJECT_STATE_STYLES: Record<ProjectState, { color: string; tint: string }> = {
  active: { color: "var(--status-done)", tint: "var(--status-done-tint)" },
  on_hold: { color: "var(--gold)", tint: "var(--harvest-tint)" },
  completed: { color: "var(--status-progress)", tint: "var(--status-progress-tint)" },
  archived: { color: "var(--status-todo)", tint: "var(--status-todo-tint)" },
};

export function ProjectStateBadge({ state }: { state: ProjectState }) {
  const style = PROJECT_STATE_STYLES[state];
  return (
    <span className={PILL} style={{ color: style.color, background: style.tint }}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
      {PROJECT_STATE_LABELS[state]}
    </span>
  );
}

export function RoleBadge({ role }: { role: WorkspaceRole }) {
  return (
    <span className={cx(PILL, role === "owner" ? "bg-lime text-forest-deep" : role === "admin" ? "bg-harvest-tint text-ink" : "bg-surface-muted text-muted")}>
      {ROLE_LABELS[role]}
    </span>
  );
}
