import { ReminderOffset, TaskStatus, type DueKind, type ProjectState } from "../generated/prisma/client.js";
import AppError from "./AppError.js";
import { zonedWallTimeToUtc } from "./dueDate.js";

// ─── Reminder schedule (SRS SR10) ─────────────────────
// Turns a task's deadline + reminder choice into the two instants the sweep acts on.
// Rules:
// - Only FUTURE instants are scheduled. Setting a reminder whose time already passed
//   schedules nothing (no surprise burst), and the overdue alert is only armed while the
//   deadline is still ahead.
// - Completed tasks and tasks in archived projects have nothing pending.
// - Date-only deadlines anchor at 09:00 on the due date in the deadline's timezone, so
//   "1 day before" lands at 09:00 the day before rather than 23:59.

const HOUR_MS = 60 * 60 * 1000;
const DATE_ONLY_ANCHOR_HOUR = 9;

const DAYS_BEFORE: Record<ReminderOffset, number> = {
    at_due: 0,
    one_hour: 0,
    one_day: 1,
    three_days: 3,
    one_week: 7,
};

export interface SchedulableTask {
    dueAt: Date | null;
    dueKind: DueKind | null;
    dueTimezone: string | null;
    reminderOffset: ReminderOffset | null;
    status: TaskStatus;
    // Optional so callers without a start (e.g. the Mongo import) needn't pass them.
    startAt?: Date | null;
    startKind?: DueKind | null;
    startTimezone?: string | null;
}

export interface Schedule {
    remindAt: Date | null;
    overdueCheckAt: Date | null;
    startReminderAt: Date | null;
}

// The calendar date (y, m, d) of `instant` as seen in `timeZone`.
const calendarDateIn = (instant: Date, timeZone: string): [number, number, number] => {
    const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
        .format(instant)
        .split("-")
        .map(Number) as [number, number, number];
    return [year, month, day];
};

// When the reminder should fire, ignoring "is it in the future".
export const reminderInstant = (task: Pick<SchedulableTask, "dueAt" | "dueKind" | "dueTimezone" | "reminderOffset">): Date | null => {
    if (!task.dueAt || !task.reminderOffset) return null;

    if (task.dueKind === "date") {
        const timeZone = task.dueTimezone || "UTC";
        const [year, month, day] = calendarDateIn(task.dueAt, timeZone);
        // Date.UTC normalises "day - 7" across month/year boundaries; the wall time is then
        // resolved in the deadline's zone (DST-safe).
        const shifted = new Date(Date.UTC(year, month - 1, day - DAYS_BEFORE[task.reminderOffset]));
        const anchor = zonedWallTimeToUtc(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate(), DATE_ONLY_ANCHOR_HOUR, 0, timeZone);
        return task.reminderOffset === "one_hour" ? new Date(anchor.getTime() - HOUR_MS) : anchor;
    }

    const offsetMs = task.reminderOffset === "one_hour" ? HOUR_MS : DAYS_BEFORE[task.reminderOffset] * 24 * HOUR_MS;
    return new Date(task.dueAt.getTime() - offsetMs);
};

// "Starts tomorrow" reminder: the day before the start — 09:00 local for a date-only start,
// 24 hours before an exact start time.
export const startReminderInstant = (task: Pick<SchedulableTask, "startAt" | "startKind" | "startTimezone">): Date | null => {
    if (!task.startAt) return null;
    if (task.startKind === "date") {
        const timeZone = task.startTimezone || "UTC";
        const [year, month, day] = calendarDateIn(task.startAt, timeZone);
        const dayBefore = new Date(Date.UTC(year, month - 1, day - 1));
        return zonedWallTimeToUtc(dayBefore.getUTCFullYear(), dayBefore.getUTCMonth() + 1, dayBefore.getUTCDate(), DATE_ONLY_ANCHOR_HOUR, 0, timeZone);
    }
    return new Date(task.startAt.getTime() - 24 * HOUR_MS);
};

export const computeSchedule = (task: SchedulableTask, projectState: ProjectState | null | undefined, now = new Date()): Schedule => {
    if (task.status === TaskStatus.completed || projectState === "archived") {
        return { remindAt: null, overdueCheckAt: null, startReminderAt: null };
    }
    const remindAt = task.dueAt ? reminderInstant(task) : null;
    // Only worth a nudge while the work hasn't begun — starting early cancels it.
    const startReminderAt = task.status === TaskStatus.todo ? startReminderInstant(task) : null;
    return {
        remindAt: remindAt && remindAt > now ? remindAt : null,
        overdueCheckAt: task.dueAt && task.dueAt > now ? task.dueAt : null,
        startReminderAt: startReminderAt && startReminderAt > now ? startReminderAt : null,
    };
};

// Do the fields that drive the schedule differ? Unrelated edits (title, labels…) must not
// re-arm a reminder that already fired.
export const scheduleInputsChanged = (
    before: SchedulableTask & { projectState: ProjectState | null },
    after: SchedulableTask & { projectState: ProjectState | null }
) =>
    before.dueAt?.getTime() !== after.dueAt?.getTime()
    || before.reminderOffset !== after.reminderOffset
    || before.startAt?.getTime() !== after.startAt?.getTime()
    || (before.status === TaskStatus.todo) !== (after.status === TaskStatus.todo)
    || (before.status === TaskStatus.completed) !== (after.status === TaskStatus.completed)
    || (before.projectState === "archived") !== (after.projectState === "archived");

// ─── Request parsing ─────────────────────
// "none"/null clears; undefined leaves it unchanged.
export const parseReminderOffset = (reminderOffset: unknown): ReminderOffset | null | undefined => {
    if (reminderOffset === undefined) return undefined;
    if (reminderOffset === null || reminderOffset === "none" || reminderOffset === "") return null;
    if (!Object.values(ReminderOffset).includes(reminderOffset as ReminderOffset)) {
        throw new AppError("Choose a reminder from the list.", 400);
    }
    return reminderOffset as ReminderOffset;
};

// NOTE: tasks created with a deadline but no explicit reminder get "1 day before" — the
// behaviour the old daily "due tomorrow" email gave everyone, so nobody silently loses it.
export const DEFAULT_REMINDER_OFFSET: ReminderOffset = ReminderOffset.one_day;
