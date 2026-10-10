// Shared "between screens" states: first-use empty, filtered empty, and failure panels
// (offline, permission, missing, generic). Each says what happened and offers the next step.
import type { ReactNode } from "react";
import { CloudOff, FileQuestion, Lock, RefreshCw, SearchX, ServerCrash, type LucideIcon } from "lucide-react";
import { cx } from "@/lib/cx";
import type { Failure } from "@/lib/errors";
import Button from "./Button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  body: ReactNode;
  action?: ReactNode;
  // A smaller version for inside panels.
  compact?: boolean;
  className?: string;
  // Optional illustration slot (first-use states).
  art?: ReactNode;
}

export function EmptyState({ icon: Icon, title, body, action, compact = false, className, art }: EmptyStateProps) {
  return (
    <div className={cx("flex flex-col items-center text-center", compact ? "px-4 py-8" : "px-6 py-14", className)}>
      {art ??
        (Icon && (
          <span className={cx("mb-4 inline-flex items-center justify-center rounded-full bg-lime text-forest-deep", compact ? "h-11 w-11" : "h-14 w-14")}>
            <Icon size={compact ? 20 : 24} aria-hidden="true" />
          </span>
        ))}
      <h3 className={cx("font-semibold text-ink", compact ? "text-[15px]" : "text-lg")}>{title}</h3>
      <div className={cx("mt-1.5 max-w-md leading-relaxed text-muted", compact ? "text-[14px]" : "text-[15px]")}>{body}</div>
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

// "Nothing matches" keeps the query visible and offers the reset (PRD FR13).
export function FilteredEmptyState({ onClear, what = "tasks" }: { onClear: () => void; what?: string }) {
  return (
    <EmptyState
      icon={SearchX}
      title={`No ${what} match these filters`}
      body="Your filters are still applied above. Clear them to see everything again, or adjust one at a time."
      action={
        <Button variant="secondary" onClick={onClear}>
          Clear filters
        </Button>
      }
    />
  );
}

const FAILURE_COPY: Record<string, { icon: LucideIcon; title: string }> = {
  offline: { icon: CloudOff, title: "You're offline" },
  network: { icon: CloudOff, title: "Couldn't reach Afritask" },
  forbidden: { icon: Lock, title: "You don't have access to this" },
  missing: { icon: FileQuestion, title: "This isn't available" },
  session: { icon: Lock, title: "Your session ended" },
  conflict: { icon: RefreshCw, title: "This changed while you were away" },
  invalid: { icon: ServerCrash, title: "Something went wrong" },
  server: { icon: ServerCrash, title: "Something went wrong" },
};

export function FailurePanel({ failure, onRetry, action, compact }: { failure: Failure; onRetry?: () => void; action?: ReactNode; compact?: boolean }) {
  const copy = FAILURE_COPY[failure.kind] ?? FAILURE_COPY.server;
  const canRetry = onRetry && failure.kind !== "forbidden" && failure.kind !== "missing";
  return (
    <div role="alert">
      <EmptyState
        icon={copy.icon}
        compact={compact}
        title={copy.title}
        body={failure.message}
        action={
          (canRetry || action) && (
            <>
              {canRetry && (
                <Button variant="secondary" icon={<RefreshCw size={16} aria-hidden="true" />} onClick={onRetry}>
                  Try again
                </Button>
              )}
              {action}
            </>
          )
        }
      />
    </div>
  );
}

// Inline note for read-only or unavailable features.
export function Notice({ icon: Icon, tone = "neutral", children, className }: { icon?: LucideIcon; tone?: "neutral" | "warning" | "danger" | "lime"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-surface-muted text-ink border-line",
    warning: "bg-harvest-tint text-ink border-harvest/50",
    danger: "bg-brick-tint text-ink border-brick/30",
    lime: "bg-lime/70 text-forest-deep border-lime-deep",
  };
  return (
    <div className={cx("flex items-start gap-3 rounded-[10px] border px-4 py-3 text-[14px] leading-relaxed", tones[tone], className)}>
      {Icon && <Icon size={18} aria-hidden="true" className={cx("mt-0.5 shrink-0", tone === "danger" ? "text-brick" : undefined)} />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function SkeletonRows({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex h-[68px] items-center gap-3 rounded-[12px] border border-line-soft bg-surface px-4">
          <span className="skeleton h-5 w-5 rounded-full" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="skeleton h-3.5" style={{ width: `${55 + ((index * 17) % 35)}%` }} />
            <span className="skeleton h-3 w-32" />
          </span>
        </div>
      ))}
    </div>
  );
}
