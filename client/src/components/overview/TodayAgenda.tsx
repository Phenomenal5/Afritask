"use client";

// Today, as an agenda: what's overdue pinned on top, then today's work in time order —
// due today, or planned to start today — with the time down the side like a day planner.
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useTaskPanels } from "@/context/TaskPanelContext";
import { useStatusChange } from "@/hooks/useStatusChange";
import { useViewer } from "@/hooks/useViewer";
import { isDueToday, isOverdue } from "@/utils/taskBuckets";
import { isoDateInZone, localTimeOf } from "@/utils/taskMeta";
import { canEditTask } from "@/utils/permissions";
import { cx } from "@/lib/cx";
import StatusSelect from "@/components/tasks/StatusSelect";
import { ProjectTag } from "@/components/tasks/TaskMeta";
import type { Task } from "@/types/models";

const VISIBLE_LIMIT = 7;

interface AgendaItem {
  task: Task;
  kind: "overdue" | "due" | "starts";
  // Sort key within today: the moment it matters (date-only = end of day for due, start of day for starts).
  sortInstant: number;
  timeLabel: string;
}

const relativeDays = (instant: string, now: Date, timezone: string) => {
  const days = Math.round((new Date(`${isoDateInZone(now, timezone)}T00:00:00Z`).getTime() - new Date(`${isoDateInZone(instant, timezone)}T00:00:00Z`).getTime()) / 86_400_000);
  return days <= 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days`;
};

export function agendaFor(tasks: Task[], now: Date, timezone: string): AgendaItem[] {
  const today = isoDateInZone(now, timezone);
  const items: AgendaItem[] = [];
  for (const task of tasks) {
    if (task.status === "completed") continue;
    if (isOverdue(task, now)) {
      items.push({ task, kind: "overdue", sortInstant: new Date(task.dueAt!).getTime(), timeLabel: relativeDays(task.dueAt!, now, timezone) });
    } else if (isDueToday(task, now, timezone)) {
      items.push({ task, kind: "due", sortInstant: new Date(task.dueAt!).getTime(), timeLabel: task.dueKind === "datetime" ? localTimeOf(task.dueAt!) : "By end of day" });
    } else if (task.status === "todo" && task.startAt && isoDateInZone(task.startAt, task.startKind === "date" ? task.startTimezone || timezone : timezone) === today) {
      items.push({ task, kind: "starts", sortInstant: new Date(task.startAt).getTime(), timeLabel: task.startKind === "datetime" ? localTimeOf(task.startAt) : "Start today" });
    }
  }
  const order = { overdue: 0, due: 1, starts: 1 } as const;
  return items.sort((first, second) => order[first.kind] - order[second.kind] || first.sortInstant - second.sortInstant);
}

function AgendaRow({ item }: { item: AgendaItem }) {
  const { openTask } = useTaskPanels();
  const changeStatus = useStatusChange();
  const viewer = useViewer();
  const { task, kind } = item;
  return (
    <li className={cx("flex items-start gap-4 border-t border-line-soft px-5 py-3 first:border-t-0", kind === "overdue" && "bg-brick-tint/40")}>
      <span className={cx("w-[5.5rem] shrink-0 pt-0.5 text-[13px] tabular-nums", kind === "overdue" ? "font-semibold text-brick" : "text-muted")}>
        {kind === "overdue" ? `Overdue · ${item.timeLabel}` : item.timeLabel}
      </span>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => openTask(task.id)} className="cursor-pointer rounded text-left text-[15px] font-medium leading-snug text-ink hover:underline">
          {task.title}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
          {kind === "starts" && <span>Planned to start today</span>}
          <ProjectTag task={task} />
        </div>
      </div>
      <StatusSelect status={task.status} taskTitle={task.title} disabled={!canEditTask(viewer, task)} onChange={(nextStatus) => changeStatus(task, nextStatus)} />
    </li>
  );
}

export default function TodayAgenda({ tasks, now, timezone, loading }: { tasks: Task[]; now: Date | null; timezone: string; loading: boolean }) {
  const items = now ? agendaFor(tasks, now, timezone) : [];
  const visible = items.slice(0, VISIBLE_LIMIT);

  return (
    <section aria-labelledby="today-heading" className="rounded-[14px] border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
        <h2 id="today-heading" className="text-[17px] font-semibold text-ink">
          Today
        </h2>
        <Link href="/tasks?due=today" className="inline-flex items-center gap-1 rounded text-[14px] font-medium text-forest hover:underline">
          My tasks
          <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </div>
      {loading || !now ? (
        <div className="flex flex-col gap-3 p-5" role="status" aria-label="Loading today">
          {[0, 1, 2].map((index) => (
            <span key={index} className="skeleton h-11" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="px-5 py-8 text-[15px] leading-relaxed text-muted">
          Nothing is due or planned to start today, and nothing is overdue. A good day to get ahead on what&apos;s coming up.
        </p>
      ) : (
        <>
          <ul>
            {visible.map((item) => (
              <AgendaRow key={item.task.id} item={item} />
            ))}
          </ul>
          {items.length > visible.length && (
            <Link href="/tasks?due=open" className="block border-t border-line-soft px-5 py-3 text-[14px] font-medium text-forest hover:underline">
              {items.length - visible.length} more for today
            </Link>
          )}
        </>
      )}
    </section>
  );
}
