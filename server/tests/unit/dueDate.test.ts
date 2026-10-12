// Unit: deadline parsing and timezone maths (PRD §9 "Dates and timezones").
import { describe, expect, it } from "@jest/globals";
import { parseDue, zonedWallTimeToUtc } from "../../src/utils/dueDate.js";

describe("zonedWallTimeToUtc", () => {
    it.each([
        ["UTC", "UTC", 2026, 12, 1, "2026-12-01T23:59:00.000Z"],
        ["Lagos (+1, no DST)", "Africa/Lagos", 2026, 12, 1, "2026-12-01T22:59:00.000Z"],
        ["Kolkata (+5:30)", "Asia/Kolkata", 2026, 12, 1, "2026-12-01T18:29:00.000Z"],
        ["New York in summer time (-4)", "America/New_York", 2026, 10, 31, "2026-11-01T03:59:00.000Z"],
        ["New York the night DST ends (-5)", "America/New_York", 2026, 11, 1, "2026-11-02T04:59:00.000Z"],
        ["Auckland across the date line (+13)", "Pacific/Auckland", 2026, 12, 1, "2026-12-01T10:59:00.000Z"],
    ])("23:59 local, %s", (_label, timeZone, year, month, day, expectedIso) => {
        expect(zonedWallTimeToUtc(year, month, day, 23, 59, timeZone).toISOString()).toBe(expectedIso);
    });
});

describe("parseDue", () => {
    it("returns undefined when no due field is sent (leave the deadline alone)", () => {
        expect(parseDue({ title: "x" }, "UTC")).toBeUndefined();
    });

    it("resolves a date-only deadline to 23:59 in the profile timezone", () => {
        expect(parseDue({ dueDate: "2026-12-01" }, "Africa/Lagos")).toEqual({
            dueAt: new Date("2026-12-01T22:59:00.000Z"),
            dueKind: "date",
            dueTimezone: "Africa/Lagos",
        });
    });

    it("prefers an explicit dueTimezone over the profile timezone", () => {
        expect(parseDue({ dueDate: "2026-12-01", dueTimezone: "Asia/Kolkata" }, "UTC")?.dueAt?.toISOString()).toBe("2026-12-01T18:29:00.000Z");
    });

    it("canonicalises the timezone spelling", () => {
        expect(parseDue({ dueDate: "2026-12-01", dueTimezone: "africa/lagos" }, "UTC")?.dueTimezone).toBe("Africa/Lagos");
    });

    it("keeps an exact instant as a datetime deadline", () => {
        const parsed = parseDue({ dueAt: "2026-12-01T09:30:00+01:00" }, "UTC");
        expect(parsed?.dueKind).toBe("datetime");
        expect(parsed?.dueAt?.toISOString()).toBe("2026-12-01T08:30:00.000Z");
    });

    it("accepts the legacy `deadline` field", () => {
        expect(parseDue({ deadline: "2026-12-01" }, "UTC")?.dueKind).toBe("date");
    });

    it.each([[null], [""]])("clears the deadline for %p", (clearValue) => {
        expect(parseDue({ dueDate: clearValue }, "UTC")).toEqual({ dueAt: null, dueKind: null, dueTimezone: null });
    });

    it.each([
        [{ dueDate: "2026-02-31" }, "That due date isn't a real date. Pick one from the calendar."],
        [{ dueDate: "13/01/2026" }, "That due date isn't a real date. Pick one from the calendar."],
        [{ dueAt: "not a date" }, "That due date isn't a real date. Pick one from the calendar."],
        [{ dueDate: 20261201 }, "That due date isn't a real date. Pick one from the calendar."],
        [{ dueDate: "2026-12-01", dueAt: "2026-12-01T09:00:00Z" }, "We couldn't read the due date. Pick it again."],
        [{ dueDate: "2026-12-01", dueTimezone: "Mars/Olympus_Mons" }, "Choose your time zone from the list."],
    ])("rejects %p", (body, message) => {
        expect(() => parseDue(body as Record<string, unknown>, "UTC")).toThrow(message);
    });
});
