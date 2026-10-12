import type { DueKind } from "../generated/prisma/client.js";
import AppError from "./AppError.js";
import { parseTimezone } from "./userValidation.js";

// ─── Deadlines (PRD §9 "Dates and timezones") ─────────────────────
// - A calendar date ("2026-12-01") means 23:59 on that date in the timezone chosen when
//   setting it (the request's dueTimezone, else the user's profile timezone).
// - A date-and-time is an exact instant (ISO string with an offset or Z).
// The resolved instant is stored in dueAt; dueKind + dueTimezone keep the intent, so a
// later profile-timezone change affects display only, never the saved instant.

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Offset (ms) of `timeZone` from UTC at `instant`, e.g. +3_600_000 for Africa/Lagos.
const timeZoneOffsetMs = (instant: Date, timeZone: string) => {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).formatToParts(instant);
    const partValue = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
    const wallClockAsUtc = Date.UTC(
        partValue("year"), partValue("month") - 1, partValue("day"),
        partValue("hour"), partValue("minute"), partValue("second")
    );
    return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
};

// The UTC instant at which the wall clock in `timeZone` reads year-month-day hour:minute.
// NOTE: computed twice because the offset at the first guess can differ from the offset
// at the answer when a DST change falls in between.
export const zonedWallTimeToUtc = (year: number, month: number, day: number, hour: number, minute: number, timeZone: string) => {
    const naiveUtc = Date.UTC(year, month - 1, day, hour, minute);
    const firstOffset = timeZoneOffsetMs(new Date(naiveUtc), timeZone);
    const firstGuess = naiveUtc - firstOffset;
    const correctedOffset = timeZoneOffsetMs(new Date(firstGuess), timeZone);
    return new Date(correctedOffset === firstOffset ? firstGuess : naiveUtc - correctedOffset);
};

// An exact moment from the client: a full ISO date-time ("2026-10-12T09:00:00.000Z"), in
// a sensible range. Anything else is null.
// NOTE: `new Date(raw)` alone accepted loose input like "1", and years Postgres can't
// store, which turned into 500s instead of a 400.
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
export const parseInstant = (rawValue: string): Date | null => {
    if (!ISO_DATE_TIME.test(rawValue)) return null;
    const instant = new Date(rawValue);
    const year = instant.getUTCFullYear();
    return Number.isNaN(instant.getTime()) || year < 1970 || year > 2999 ? null : instant;
};

export interface ParsedDue {
    dueAt: Date | null;
    dueKind: DueKind | null;
    dueTimezone: string | null;
}

// Read the due fields of a create/update body. undefined = "not touching the deadline".
// Accepts { dueDate: "YYYY-MM-DD" } | { dueAt: ISO datetime } | either set to null to
// clear, plus the legacy { deadline } (date or datetime) older clients send.
export const parseDue = (body: Record<string, unknown>, profileTimezone: string): ParsedDue | undefined => {
    const hasDueDate = body.dueDate !== undefined;
    const hasDueAt = body.dueAt !== undefined;
    const legacyDeadline = body.deadline;
    if (!hasDueDate && !hasDueAt && legacyDeadline === undefined) return undefined;
    if (hasDueDate && hasDueAt) throw new AppError("Send either dueDate or dueAt, not both", 400);

    const rawValue = hasDueDate ? body.dueDate : hasDueAt ? body.dueAt : legacyDeadline;
    if (rawValue === null || rawValue === "") return { dueAt: null, dueKind: null, dueTimezone: null };
    if (typeof rawValue !== "string") throw new AppError("Please provide a valid due date", 400);

    const dueTimezone = parseTimezone(body.dueTimezone) ?? profileTimezone;

    if (DATE_ONLY_PATTERN.test(rawValue) && !hasDueAt) {
        const [year, month, day] = rawValue.split("-").map(Number) as [number, number, number];
        const dueAt = zonedWallTimeToUtc(year, month, day, 23, 59, dueTimezone);
        // Reject impossible calendar dates like 2026-02-31 (Date.UTC would roll them over).
        const roundTrip = new Date(Date.UTC(year, month - 1, day));
        if (roundTrip.getUTCMonth() !== month - 1 || Number.isNaN(dueAt.getTime())) {
            throw new AppError("Please provide a valid due date", 400);
        }
        return { dueAt, dueKind: "date", dueTimezone };
    }

    const dueAt = parseInstant(rawValue);
    if (!dueAt) throw new AppError("Please provide a valid due date", 400);
    return { dueAt, dueKind: "datetime", dueTimezone };
};
