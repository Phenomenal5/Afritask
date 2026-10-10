// Due-date form fields ⇄ the server's due contract (server/src/utils/dueDate.ts):
//   { dueDate, dueTimezone } = due by the end of that day in that zone;
//   { dueAt }                = an exact instant;
//   { dueDate: null }        = clear it.
import { isoDateInZone, localTimeOf } from "@/utils/taskMeta";
import type { Task } from "@/types/models";
import type { TaskInput } from "@/context/TaskContext";

export interface DueFields {
  dueDate: string;
  dueTime: string;
}

const deviceTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// The form's due fields for an existing task, shown the way it was set (PRD §9).
export const dueFieldsOf = (task: Task): DueFields => {
  if (!task.dueAt) return { dueDate: "", dueTime: "" };
  if (task.dueKind === "date") return { dueDate: isoDateInZone(task.dueAt, task.dueTimezone || "UTC"), dueTime: "" };
  return { dueDate: isoDateInZone(task.dueAt, deviceTimezone()), dueTime: localTimeOf(task.dueAt) };
};

export const dueFieldError = (fields: DueFields): string | null =>
  fields.dueTime && !fields.dueDate ? "Pick a date for this time, or clear the time." : null;

// NOTE: untouched due fields are NOT re-sent when editing. Re-sending a date-only due date
// would re-resolve it in the CURRENT profile timezone and could move a deadline that was
// set in another zone (PRD §9: the saved instant must not drift).
export const duePayload = (fields: DueFields, profileTimezone: string, original: Task | null): Partial<TaskInput> => {
  if (original) {
    const before = dueFieldsOf(original);
    if (before.dueDate === fields.dueDate && before.dueTime === fields.dueTime) return {};
  }
  if (fields.dueDate && fields.dueTime) return { dueAt: new Date(`${fields.dueDate}T${fields.dueTime}`).toISOString() };
  if (fields.dueDate) return { dueDate: fields.dueDate, dueTimezone: profileTimezone };
  if (original?.dueAt) return { dueDate: null };
  return {};
};
