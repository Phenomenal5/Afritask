// Unit: day boundaries behind the My Tasks views (SRS SR11/SR14).
import { describe, expect, it } from "@jest/globals";
import { dayBounds, isDueView } from "../../src/utils/taskViews.js";

describe("dayBounds", () => {
    it("uses the viewer's calendar day, not UTC's", () => {
        // 23:30 UTC on Saturday 10 Oct is already 00:30 Sunday 11 Oct in Lagos (UTC+1).
        const bounds = dayBounds(new Date("2026-10-10T23:30:00Z"), "Africa/Lagos");
        expect(bounds.startOfToday.toISOString()).toBe("2026-10-10T23:00:00.000Z");
        expect(bounds.startOfTomorrow.toISOString()).toBe("2026-10-11T23:00:00.000Z");
        // The week started Monday 5 Oct, local midnight.
        expect(bounds.startOfWeek.toISOString()).toBe("2026-10-04T23:00:00.000Z");
    });

    it("on a Monday, the week starts today", () => {
        const bounds = dayBounds(new Date("2026-10-12T10:00:00Z"), "UTC");
        expect(bounds.startOfWeek.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    });

    it("handles a 25-hour day when clocks go back", () => {
        // London leaves summer time on Sunday 25 Oct 2026.
        const bounds = dayBounds(new Date("2026-10-25T12:00:00Z"), "Europe/London");
        expect(bounds.startOfToday.toISOString()).toBe("2026-10-24T23:00:00.000Z");
        expect(bounds.startOfTomorrow.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    });

    it("weeks cross month boundaries", () => {
        // Thursday 1 Oct 2026 → Monday 28 Sep.
        const bounds = dayBounds(new Date("2026-10-01T12:00:00Z"), "UTC");
        expect(bounds.startOfWeek.toISOString()).toBe("2026-09-28T00:00:00.000Z");
    });
});

describe("isDueView", () => {
    it("knows the views", () => {
        expect(isDueView("today")).toBe(true);
        expect(isDueView("week")).toBe(true);
        expect(isDueView("tomorrow")).toBe(false);
        expect(isDueView(["today"])).toBe(false);
    });
});
