// Display metadata and date helpers for V1 tasks (server values below).

export const TASK_STATUSES = ["todo", "in_progress", "in_review", "completed"];

export const STATUS_LABELS = {
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  completed: "Completed",
};

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"];

export const PRIORITY_STYLES = {
  urgent: { color: "var(--error)", bg: "var(--error-tint)", label: "Urgent" },
  high: { color: "var(--clay)", bg: "var(--clay-tint)", label: "High" },
  medium: { color: "var(--gold)", bg: "var(--gold-tint)", label: "Medium" },
  low: { color: "var(--stone)", bg: "var(--stone-tint)", label: "Low" },
};

// "YYYY-MM-DD" of an instant as seen in `timeZone` (en-CA formats dates that way).
export const isoDateInZone = (instant, timeZone) =>
  new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(instant));

// "HH:MM" of an instant in the browser's own zone (for the time input).
export const localTimeOf = (instant) => {
  const date = new Date(instant);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

// Human label for a task's deadline, plus whether it's overdue.
// NOTE (PRD §9): a date-only deadline is shown as the DATE it was set for (in the zone it
// was set in) — never as a converted clock time like "Dec 1, 22:59". Overdue is judged by
// the due INSTANT, so a "today" task becomes overdue only after 23:59 in its zone.
export const describeDue = (task, now = new Date()) => {
  if (!task.dueAt) return null;
  const dueAt = new Date(task.dueAt);
  const overdue = task.status !== "completed" && dueAt.getTime() < now.getTime();

  if (task.dueKind === "date") {
    const zone = task.dueTimezone || "UTC";
    const dueDate = isoDateInZone(dueAt, zone);
    const today = isoDateInZone(now, zone);
    const tomorrow = isoDateInZone(new Date(now.getTime() + 24 * 60 * 60 * 1000), zone);
    const label =
      dueDate === today
        ? "Today"
        : dueDate === tomorrow
          ? "Tomorrow"
          : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: zone }).format(dueAt);
    return { text: overdue ? `${label} (overdue)` : label, overdue };
  }

  const label = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(dueAt);
  return { text: overdue ? `${label} (overdue)` : label, overdue };
};
