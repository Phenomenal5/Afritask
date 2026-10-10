"use client";

// The keyboard-accessible status control (PRD FR12): a native select dressed as the
// status pill, so it works with arrows, typing and screen readers everywhere. Dragging on
// the board is only a shortcut for this.
import { ChevronDown } from "lucide-react";
import { STATUS_LABELS, TASK_STATUSES } from "@/utils/taskMeta";
import { STATUS_META } from "@/components/ui/Badges";
import { StatusBadge } from "@/components/ui/Badges";
import { cx } from "@/lib/cx";
import type { TaskStatus } from "@/types/models";

interface StatusSelectProps {
  status: TaskStatus;
  taskTitle: string;
  onChange: (status: TaskStatus) => void;
  disabled?: boolean;
  disabledReason?: string | null;
  className?: string;
}

export default function StatusSelect({ status, taskTitle, onChange, disabled, disabledReason, className }: StatusSelectProps) {
  if (disabled) {
    // Read-only: show the badge, and say why it can't change on hover/focus.
    return (
      <span title={disabledReason ?? undefined} className={className}>
        <StatusBadge status={status} />
      </span>
    );
  }

  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    // w-fit + self-start: in stacked (flex-col) rows the wrapper would otherwise stretch and
    // the chevron would drift away from the pill.
    <span className={cx("relative inline-flex w-fit self-start sm:self-auto", className)}>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center"
        style={{ color: meta.color }}
      >
        <Icon size={14} strokeWidth={2.25} />
      </span>
      <select
        value={status}
        onChange={(event) => onChange(event.target.value as TaskStatus)}
        aria-label={`Status of “${taskTitle}”`}
        // NOTE: stays 16px on phones — iOS zooms the page into any focused select below that.
        className="h-9 min-w-[9.5rem] cursor-pointer appearance-none rounded-full border border-transparent pl-8 pr-8 font-semibold sm:text-[13px]! transition-colors hover:border-current focus-visible:border-current"
        style={{ color: meta.color, background: meta.tint }}
      >
        {TASK_STATUSES.map((statusOption: TaskStatus) => (
          <option key={statusOption} value={statusOption}>
            {STATUS_LABELS[statusOption]}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" style={{ color: meta.color }} />
    </span>
  );
}
