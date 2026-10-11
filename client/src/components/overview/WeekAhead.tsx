"use client";

// The next six days at a glance — a week-to-view strip: for each day, what's due or planned
// to start, a few titles each. Empty days stay visible (a free day is information too).
import { useTaskPanels } from "@/context/TaskPanelContext";
import { isoDateInZone } from "@/utils/taskMeta";
import { cx } from "@/lib/cx";
import type { Task } from "@/types/models";

const DAYS_AHEAD = 6;
const TITLES_PER_DAY = 3;

interface DayColumn {
  isoDate: string;
  weekday: string;
  dayOfMonth: string;
  tasks: { task: Task; reason: "due" | "starts" }[];
}

export function weekAheadFor(tasks: Task[], now: Date, timezone: string): DayColumn[] {
  const todayIso = isoDateInZone(now, timezone);
  const columns: DayColumn[] = Array.from({ length: DAYS_AHEAD }, (_unused, offset) => {
    const day = new Date(`${todayIso}T12:00:00Z`);
    day.setUTCDate(day.getUTCDate() + offset + 1);
    return {
      isoDate: day.toISOString().slice(0, 10),
      weekday: new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(day),
      dayOfMonth: new Intl.DateTimeFormat(undefined, { day: "numeric", timeZone: "UTC" }).format(day),
      tasks: [],
    };
  });
  const columnByDate = new Map(columns.map((column) => [column.isoDate, column]));
  for (const task of tasks) {
    if (task.status === "completed") continue;
    const dueDay = task.dueAt ? isoDateInZone(task.dueAt, task.dueKind === "date" ? task.dueTimezone || timezone : timezone) : null;
    const startDay = task.startAt && task.status === "todo" ? isoDateInZone(task.startAt, task.startKind === "date" ? task.startTimezone || timezone : timezone) : null;
    if (dueDay && columnByDate.has(dueDay)) columnByDate.get(dueDay)!.tasks.push({ task, reason: "due" });
    else if (startDay && columnByDate.has(startDay)) columnByDate.get(startDay)!.tasks.push({ task, reason: "starts" });
  }
  return columns;
}

export default function WeekAhead({ tasks, now, timezone }: { tasks: Task[]; now: Date | null; timezone: string }) {
  const { openTask } = useTaskPanels();
  if (!now) return null;
  const columns = weekAheadFor(tasks, now, timezone);

  return (
    <section aria-labelledby="week-heading" className="rounded-[14px] border border-line bg-surface">
      <h2 id="week-heading" className="border-b border-line-soft px-5 py-4 text-[17px] font-semibold text-ink">
        The week ahead
      </h2>
      <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {columns.map((column) => {
          const hidden = column.tasks.length - TITLES_PER_DAY;
          return (
            <li key={column.isoDate} className="border-b border-r border-line-soft px-4 py-3 last:border-r-0">
              <p className="flex items-baseline gap-1.5">
                <span className="text-[13px] font-medium text-muted">{column.weekday}</span>
                <span className={cx("text-[18px] font-semibold tabular-nums", column.tasks.length ? "text-ink" : "text-muted/70")}>{column.dayOfMonth}</span>
              </p>
              {column.tasks.length === 0 ? (
                <p className="mt-1.5 text-[13px] text-muted/80">Free</p>
              ) : (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {column.tasks.slice(0, TITLES_PER_DAY).map(({ task, reason }) => (
                    <li key={task.id} className="flex items-start gap-1.5">
                      <span aria-hidden="true" className={cx("mt-[7px] size-1.5 shrink-0 rounded-full", reason === "due" ? "bg-forest" : "border border-forest")} />
                      <button type="button" onClick={() => openTask(task.id)} className="line-clamp-2 cursor-pointer rounded text-left text-[13.5px] leading-snug text-ink hover:underline">
                        <span className="sr-only">{reason === "due" ? "Due: " : "Starts: "}</span>
                        {task.title}
                      </button>
                    </li>
                  ))}
                  {hidden > 0 && <li className="text-[12.5px] text-muted">+{hidden} more</li>}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      <p className="flex flex-wrap gap-x-4 gap-y-1 px-5 py-2.5 text-[12.5px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-forest" /> Due
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="size-1.5 rounded-full border border-forest" /> Planned to start
        </span>
      </p>
    </section>
  );
}
