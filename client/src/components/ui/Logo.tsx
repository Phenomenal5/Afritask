// Afritask mark: a path curving up to a single point — "your next step".
import { cx } from "@/lib/cx";

export function LogoMark({ size = 28, className, onDark = false }: { size?: number; className?: string; onDark?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <rect width="32" height="32" rx="9" fill={onDark ? "var(--lime)" : "var(--forest)"} />
      <path d="M8 23c3.5 0 4.5-8 8.5-8S21 9 24 9" stroke={onDark ? "var(--forest)" : "var(--lime)"} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="24" cy="9" r="3" fill="var(--harvest)" />
      <circle cx="8" cy="23" r="1.8" fill={onDark ? "var(--forest)" : "var(--lime)"} />
    </svg>
  );
}

export default function Logo({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2.5", className)}>
      <LogoMark onDark={onDark} />
      <span className={cx("font-display text-[22px] font-semibold tracking-tight", onDark ? "text-sidebar-text" : "text-ink")}>Afritask</span>
    </span>
  );
}
