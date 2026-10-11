// Start-date form fields ⇄ the server's start contract (server/src/utils/startDate.ts):
//   { startDate, startTimezone } = from the start of that day in that zone;
//   { startAt }                   = an exact instant;
//   { startDate: null }           = no start date.
import { isoDateInZone, localTimeOf } from "@/utils/taskMeta";
import type { Task } from "@/types/models";
import type { TaskInput } from "@/context/TaskContext";

export interface StartFields {
  startDate: string;
  startTime: string;
}

const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// Shown the way it was set: a date-only start keeps its calendar date in its own zone.
export const startFieldsOf = (task: Task): StartFields => {
  if (!task.startAt) return { startDate: "", startTime: "" };
  if (task.startKind === "date") return { startDate: isoDateInZone(task.startAt, task.startTimezone || "UTC"), startTime: "" };
  return { startDate: isoDateInZone(task.startAt, deviceTimezone()), startTime: localTimeOf(task.startAt) };
};

// Same check the server makes, said before saving: a task can't start after it's due.
export const startFieldError = (fields: StartFields & { dueDate: string; dueTime: string }): string | null => {
  if (fields.startTime && !fields.startDate) return "Pick a date for this start time, or clear the time.";
  if (!fields.startDate || !fields.dueDate) return null;
  const start = `${fields.startDate}T${fields.startTime || "00:00"}`;
  const due = `${fields.dueDate}T${fields.dueTime || "23:59"}`;
  return start > due ? "The start can't be after the due date." : null;
};

// NOTE: like the due date, an untouched start isn't re-sent when editing — re-sending a
// date-only start would re-resolve it in the CURRENT profile timezone and could move it.
export const startPayload = (fields: StartFields, profileTimezone: string, original: Task | null): Partial<TaskInput> => {
  if (original) {
    const before = startFieldsOf(original);
    if (before.startDate === fields.startDate && before.startTime === fields.startTime) return {};
  }
  if (fields.startDate && fields.startTime) return { startAt: new Date(`${fields.startDate}T${fields.startTime}`).toISOString() };
  if (fields.startDate) return { startDate: fields.startDate, startTimezone: profileTimezone };
  if (original?.startAt) return { startDate: null };
  return {};
};

// "Starts tomorrow", "Starts Fri 14 Oct", or null once it has started (or has no start).
export const describeStart = (task: Task, now: Date): string | null => {
  if (!task.startAt || task.status !== "todo") return null;
  const startAt = new Date(task.startAt);
  if (startAt.getTime() <= now.getTime()) return null;
  const zone = task.startKind === "date" ? task.startTimezone || "UTC" : deviceTimezone();
  const startDay = isoDateInZone(startAt, zone);
  const today = isoDateInZone(now, zone);
  const tomorrow = isoDateInZone(new Date(now.getTime() + 24 * 60 * 60 * 1000), zone);
  const time = task.startKind === "datetime" ? ` at ${localTimeOf(task.startAt)}` : "";
  if (startDay === today) return `Starts today${time}`;
  if (startDay === tomorrow) return `Starts tomorrow${time}`;
  return `Starts ${new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: zone }).format(startAt)}${time}`;
};
