// Reminder choices (server: utils/reminderSchedule.ts). One per task; "none" turns it off.
import type { ReminderOffset } from "@/types/models";

export type ReminderChoice = ReminderOffset | "none";

export const REMINDER_OPTIONS: { value: ReminderChoice; label: string }[] = [
  { value: "none", label: "No reminder" },
  { value: "at_due", label: "At the due time" },
  { value: "one_hour", label: "1 hour before" },
  { value: "one_day", label: "1 day before" },
  { value: "three_days", label: "3 days before" },
  { value: "one_week", label: "1 week before" },
];

// What new tasks with a due date get unless someone picks otherwise (matches the server).
export const DEFAULT_REMINDER: ReminderChoice = "one_day";

export const reminderChoiceOf = (reminderOffset: ReminderOffset | null | undefined): ReminderChoice => reminderOffset ?? "none";

// Explains the timing, including the date-only 09:00 anchor, so nobody wonders why a
// "due Friday" reminder arrives in the morning.
export const reminderHint = (choice: ReminderChoice, hasTime: boolean): string => {
  if (choice === "none") return "No reminder. You'll still be told if it becomes overdue.";
  if (!hasTime) {
    return choice === "at_due" || choice === "one_hour"
      ? "For a date without a time, this goes out on the morning of the due date."
      : "For a date without a time, reminders go out at 09:00. You'll also be told if it becomes overdue.";
  }
  return "Sent by email and in-app to the assignee (or the creator if nobody is assigned).";
};
