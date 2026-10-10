// Groups tasks by when they need attention (PRD FR11/FR14). Everything is computed from
// the real task list in the viewer's profile timezone — there are no stored counts.
import { isoDateInZone } from "@/utils/taskMeta";
import type { Task } from "@/types/models";

export type DueBucket = "overdue" | "today" | "upcoming" | "none" | "completed";

export const DUE_BUCKET_LABELS: Record<DueBucket, string> = {
  overdue: "Overdue",
  today: "Due today",
  upcoming: "Upcoming",
  none: "No due date",
  completed: "Completed",
};

// The calendar date a task is due, as the person who set it meant it. A date-only
// deadline keeps the date it was set for (PRD §9) — never a converted clock time.
const dueDateOf = (task: Task, viewerTimezone: string) =>
  task.dueKind === "date" ? isoDateInZone(task.dueAt as string, task.dueTimezone || "UTC") : isoDateInZone(task.dueAt as string, viewerTimezone);

// NOTE: "Overdue" is judged by the due INSTANT, "Today" by the local calendar date. A task
// due today that has already passed counts as Overdue only, so no task is counted twice.
export function dueBucketOf(task: Task, now: Date, viewerTimezone: string): DueBucket {
  if (task.status === "completed") return "completed";
  if (!task.dueAt) return "none";
  if (new Date(task.dueAt).getTime() < now.getTime()) return "overdue";
  const today = isoDateInZone(now, viewerTimezone);
  return dueDateOf(task, viewerTimezone) <= today ? "today" : "upcoming";
}

// ─── View membership (same rules as the server's ?due= views, utils/taskViews.ts) ─────────────────────
// A task can be in more than one: one due earlier today and already passed is BOTH
// "today" and "overdue" (SRS SR11). "Today" = the due instant falls on the viewer's local
// date, exactly as the server decides it, so counts and lists agree.
const isOpen = (task: Task) => task.status !== "completed";
export const isOverdue = (task: Task, now: Date) => isOpen(task) && !!task.dueAt && new Date(task.dueAt).getTime() < now.getTime();
export const isDueToday = (task: Task, now: Date, viewerTimezone: string) =>
  isOpen(task) && !!task.dueAt && isoDateInZone(task.dueAt, viewerTimezone) === isoDateInZone(now, viewerTimezone);
export const isUpcoming = (task: Task, now: Date, viewerTimezone: string) =>
  isOpen(task) && !!task.dueAt && isoDateInZone(task.dueAt, viewerTimezone) > isoDateInZone(now, viewerTimezone);
export const hasNoDueDate = (task: Task) => isOpen(task) && !task.dueAt;

// Monday 00:00 of this week, as "YYYY-MM-DD" in the viewer's zone (PRD FR14: Monday–Sunday).
const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
export function startOfWeekIso(now: Date, viewerTimezone: string): string {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: viewerTimezone, weekday: "short" }).format(now);
  const todayIso = isoDateInZone(now, viewerTimezone);
  const monday = new Date(`${todayIso}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - (WEEKDAY_INDEX[weekday] ?? 0));
  return monday.toISOString().slice(0, 10);
}

export const completedThisWeek = (task: Task, now: Date, viewerTimezone: string) =>
  task.status === "completed" && !!task.completedAt && isoDateInZone(task.completedAt, viewerTimezone) >= startOfWeekIso(now, viewerTimezone);

// Soonest deadline first; undated work after dated work; then newest.
export function compareByUrgency(first: Task, second: Task): number {
  if (first.dueAt && second.dueAt) return new Date(first.dueAt).getTime() - new Date(second.dueAt).getTime();
  if (first.dueAt) return -1;
  if (second.dueAt) return 1;
  return new Date(second.createdAt).getTime() - new Date(first.createdAt).getTime();
}
