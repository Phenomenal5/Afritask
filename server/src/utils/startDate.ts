import type { DueKind } from "../generated/prisma/client.js";
import AppError from "./AppError.js";
import { zonedWallTimeToUtc } from "./dueDate.js";
import { parseTimezone } from "./userValidation.js";

// ─── Start dates ("I'll start this tomorrow") ─────────────────────
// Mirrors the due-date contract (utils/dueDate.ts):
// - { startDate: "YYYY-MM-DD" } → the START of that day (00:00) in startTimezone, or the
//   person's profile timezone;
// - { startAt: ISO datetime }   → that exact instant;
// - either set to null           → no start date.
// undefined = not touching the start.

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface ParsedStart {
    startAt: Date | null;
    startKind: DueKind | null;
    startTimezone: string | null;
}

export const parseStart = (body: Record<string, unknown>, profileTimezone: string): ParsedStart | undefined => {
    const hasStartDate = body.startDate !== undefined;
    const hasStartAt = body.startAt !== undefined;
    if (!hasStartDate && !hasStartAt) return undefined;
    if (hasStartDate && hasStartAt) throw new AppError("Send either startDate or startAt, not both", 400);

    const rawValue = hasStartDate ? body.startDate : body.startAt;
    if (rawValue === null || rawValue === "") return { startAt: null, startKind: null, startTimezone: null };
    if (typeof rawValue !== "string") throw new AppError("Please provide a valid start date", 400);

    const startTimezone = parseTimezone(body.startTimezone) ?? profileTimezone;

    if (hasStartDate) {
        if (!DATE_ONLY_PATTERN.test(rawValue)) throw new AppError("startDate must look like YYYY-MM-DD", 400);
        const [year, month, day] = rawValue.split("-").map(Number) as [number, number, number];
        const roundTrip = new Date(Date.UTC(year, month - 1, day));
        if (roundTrip.getUTCMonth() !== month - 1) throw new AppError("Please provide a valid start date", 400);
        return { startAt: zonedWallTimeToUtc(year, month, day, 0, 0, startTimezone), startKind: "date", startTimezone };
    }

    const startAt = new Date(rawValue);
    if (Number.isNaN(startAt.getTime())) throw new AppError("Please provide a valid start date", 400);
    return { startAt, startKind: "datetime", startTimezone };
};

// A task can't be planned to start after it's due.
export const assertStartNotAfterDue = (startAt: Date | null | undefined, dueAt: Date | null | undefined) => {
    if (startAt && dueAt && startAt.getTime() > dueAt.getTime()) {
        throw new AppError("The start date can't be after the due date.", 400);
    }
};
