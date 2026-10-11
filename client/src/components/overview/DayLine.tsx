// The overview's opening line, the way a paper planner opens a page: the date, then the
// day in one sentence — "2 overdue, 3 due today, 4 in progress, 6 done since Monday" —
// each number linking to exactly the tasks it counts (server counts, SRS SR14).
import Link from "next/link";
import { cx } from "@/lib/cx";
import type { DashboardCounts } from "@/types/models";

interface DayLineProps {
  now: Date | null;
  timezone: string;
  personal: DashboardCounts["personal"] | undefined;
}

function CountLink({ value, label, href, urgent = false }: { value: number | undefined; label: string; href: string; urgent?: boolean }) {
  if (value === undefined) return <span className="skeleton inline-block h-4 w-16 align-middle" aria-hidden="true" />;
  return (
    <Link
      href={href}
      className={cx(
        "rounded-[4px] font-semibold underline decoration-1 underline-offset-[5px] transition-colors",
        urgent && value > 0 ? "text-brick decoration-brick/40 hover:decoration-brick" : "text-ink decoration-line hover:decoration-forest"
      )}
    >
      {value} {label}
    </Link>
  );
}

export default function DayLine({ now, timezone, personal }: DayLineProps) {
  const dateText = now ? new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: timezone }).format(now) : null;
  return (
    <p className="text-[16px] leading-relaxed text-muted">
      <span className="font-medium text-ink">{dateText ?? "Today"}</span>
      <span aria-hidden="true" className="mx-2 text-line">
        /
      </span>
      <CountLink value={personal?.overdue} label="overdue" href="/tasks?due=overdue" urgent />,{" "}
      <CountLink value={personal?.dueToday} label="due today" href="/tasks?due=today" />,{" "}
      <CountLink value={personal?.inProgress} label="in progress" href="/tasks?status=in_progress" />, and{" "}
      <CountLink value={personal?.completedThisWeek} label="done since Monday" href="/tasks?due=week" />.
    </p>
  );
}
