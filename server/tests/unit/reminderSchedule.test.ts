// Unit: reminder schedule maths (SRS SR10) — when a reminder fires and what gets scheduled.
import { describe, expect, it } from "@jest/globals";
import { computeSchedule, parseReminderOffset, reminderInstant, scheduleInputsChanged, startReminderInstant, type SchedulableTask } from "../../src/utils/reminderSchedule.js";

const NOW = new Date("2026-10-10T12:00:00Z");

const exactTask = (overrides: Partial<SchedulableTask> = {}): SchedulableTask => ({
    dueAt: new Date("2026-10-20T15:00:00Z"),
    dueKind: "datetime",
    dueTimezone: "Africa/Lagos",
    reminderOffset: "one_day",
    status: "todo",
    ...overrides,
});

// "Due 2026-10-20" in Lagos (UTC+1) resolves to 23:59 local = 22:59Z.
const dateOnlyTask = (overrides: Partial<SchedulableTask> = {}): SchedulableTask =>
    exactTask({ dueAt: new Date("2026-10-20T22:59:00Z"), dueKind: "date", ...overrides });

describe("reminderInstant", () => {
    it("subtracts the offset from an exact due time", () => {
        expect(reminderInstant(exactTask({ reminderOffset: "at_due" }))?.toISOString()).toBe("2026-10-20T15:00:00.000Z");
        expect(reminderInstant(exactTask({ reminderOffset: "one_hour" }))?.toISOString()).toBe("2026-10-20T14:00:00.000Z");
        expect(reminderInstant(exactTask({ reminderOffset: "one_week" }))?.toISOString()).toBe("2026-10-13T15:00:00.000Z");
    });

    it("anchors date-only deadlines at 09:00 local, not 23:59", () => {
        // 09:00 Lagos = 08:00Z
        expect(reminderInstant(dateOnlyTask({ reminderOffset: "at_due" }))?.toISOString()).toBe("2026-10-20T08:00:00.000Z");
        expect(reminderInstant(dateOnlyTask({ reminderOffset: "one_hour" }))?.toISOString()).toBe("2026-10-20T07:00:00.000Z");
        expect(reminderInstant(dateOnlyTask({ reminderOffset: "one_day" }))?.toISOString()).toBe("2026-10-19T08:00:00.000Z");
        expect(reminderInstant(dateOnlyTask({ reminderOffset: "three_days" }))?.toISOString()).toBe("2026-10-17T08:00:00.000Z");
    });

    it("crosses month boundaries and respects DST in the deadline's zone", () => {
        // Due 2026-11-02 in London: one week before is 2026-10-26 09:00 — after the clocks
        // went back on 25 Oct, so 09:00 GMT = 09:00Z (not 08:00Z as in summer time).
        const london = exactTask({ dueAt: new Date("2026-11-02T23:59:00Z"), dueKind: "date", dueTimezone: "Europe/London", reminderOffset: "one_week" });
        expect(reminderInstant(london)?.toISOString()).toBe("2026-10-26T09:00:00.000Z");
    });

    it("is null without a deadline or a reminder", () => {
        expect(reminderInstant(exactTask({ dueAt: null }))).toBeNull();
        expect(reminderInstant(exactTask({ reminderOffset: null }))).toBeNull();
    });
});

describe("computeSchedule", () => {
    it("schedules the reminder and the overdue check in the future", () => {
        expect(computeSchedule(exactTask(), "active", NOW)).toEqual({
            remindAt: new Date("2026-10-19T15:00:00Z"),
            overdueCheckAt: new Date("2026-10-20T15:00:00Z"),
            startReminderAt: null,
        });
    });

    it("never schedules a time that already passed", () => {
        const soon = exactTask({ dueAt: new Date("2026-10-10T18:00:00Z"), reminderOffset: "one_day" });
        expect(computeSchedule(soon, null, NOW)).toEqual({ remindAt: null, overdueCheckAt: new Date("2026-10-10T18:00:00Z"), startReminderAt: null });
        const overdue = exactTask({ dueAt: new Date("2026-10-01T00:00:00Z") });
        expect(computeSchedule(overdue, null, NOW)).toEqual({ remindAt: null, overdueCheckAt: null, startReminderAt: null });
    });

    it("has nothing pending for completed tasks or archived projects", () => {
        expect(computeSchedule(exactTask({ status: "completed" }), null, NOW)).toEqual({ remindAt: null, overdueCheckAt: null, startReminderAt: null });
        expect(computeSchedule(exactTask(), "archived", NOW)).toEqual({ remindAt: null, overdueCheckAt: null, startReminderAt: null });
    });

    it("still arms the overdue alert when no reminder is chosen", () => {
        expect(computeSchedule(exactTask({ reminderOffset: null }), null, NOW)).toEqual({ remindAt: null, overdueCheckAt: new Date("2026-10-20T15:00:00Z"), startReminderAt: null });
    });
});

describe("scheduleInputsChanged", () => {
    const base = { ...exactTask(), projectState: "active" as const };
    it("ignores unrelated edits and status moves between open states", () => {
        expect(scheduleInputsChanged(base, { ...base })).toBe(false);
        const started = { ...base, status: "in_progress" as const };
        expect(scheduleInputsChanged(started, { ...started, status: "in_review" })).toBe(false);
    });
    it("reacts to due date, reminder, completion and archive changes", () => {
        expect(scheduleInputsChanged(base, { ...base, dueAt: new Date("2026-10-21T15:00:00Z") })).toBe(true);
        expect(scheduleInputsChanged(base, { ...base, reminderOffset: "at_due" })).toBe(true);
        expect(scheduleInputsChanged(base, { ...base, status: "completed" })).toBe(true);
        expect(scheduleInputsChanged(base, { ...base, projectState: "archived" })).toBe(true);
        // Leaving To do cancels a pending "starts tomorrow" reminder.
        expect(scheduleInputsChanged(base, { ...base, status: "in_progress" })).toBe(true);
        expect(scheduleInputsChanged(base, { ...base, startAt: new Date("2026-10-15T00:00:00Z") })).toBe(true);
    });
});

describe("parseReminderOffset", () => {
    it("accepts the five choices, clears on none/null, rejects anything else", () => {
        expect(parseReminderOffset("three_days")).toBe("three_days");
        expect(parseReminderOffset("none")).toBeNull();
        expect(parseReminderOffset(null)).toBeNull();
        expect(parseReminderOffset(undefined)).toBeUndefined();
        expect(() => parseReminderOffset("two_days")).toThrow(/Reminder must be/);
    });
});

describe("start reminders", () => {
    it("fire the day before: 09:00 local for a date-only start, 24h before an exact one", () => {
        // Start 2026-10-15 in Lagos (UTC+1) = 00:00 local = 2026-10-14T23:00Z → 09:00 on the 14th = 08:00Z.
        expect(startReminderInstant({ startAt: new Date("2026-10-14T23:00:00Z"), startKind: "date", startTimezone: "Africa/Lagos" })?.toISOString()).toBe("2026-10-14T08:00:00.000Z");
        expect(startReminderInstant({ startAt: new Date("2026-10-15T14:00:00Z"), startKind: "datetime", startTimezone: "UTC" })?.toISOString()).toBe("2026-10-14T14:00:00.000Z");
        expect(startReminderInstant({ startAt: null })).toBeNull();
    });

    it("are scheduled only for To do work, only in the future, even without a due date", () => {
        const startTomorrowish = { ...exactTask({ dueAt: null, reminderOffset: null }), startAt: new Date("2026-10-12T00:00:00Z"), startKind: "date" as const, startTimezone: "UTC" };
        expect(computeSchedule(startTomorrowish, null, NOW)).toEqual({ remindAt: null, overdueCheckAt: null, startReminderAt: new Date("2026-10-11T09:00:00Z") });
        expect(computeSchedule({ ...startTomorrowish, status: "in_progress" }, null, NOW).startReminderAt).toBeNull();
        // Starting today: the "day before" moment has passed — nothing scheduled.
        expect(computeSchedule({ ...startTomorrowish, startAt: new Date("2026-10-10T00:00:00Z") }, null, NOW).startReminderAt).toBeNull();
    });
});
