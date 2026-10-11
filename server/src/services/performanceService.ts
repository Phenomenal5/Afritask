import prisma from "../config/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import { zonedWallTimeToUtc } from "../utils/dueDate.js";

// ─── Monthly performance summary ─────────────────────
// Personal numbers for one calendar month in the person's own timezone, across every
// workspace they're in. Counts only — never task titles or content, so a summary can be
// shared safely.
//
// "Your tasks" = assigned to you, or created by you with nobody assigned (the same rule
// reminders use for who's responsible).
//
// The definitions (also shown in the app):
// - completed on time:          completed by the deadline (tasks with one)
// - met without extending:      on time AND the deadline was never pushed later
// - extensions:                 times a deadline of yours was pushed later this month
// - planning days:              days you created or updated tasks (organizing your work)
// - planned ahead:              tasks you created this month that were given a due or start date

export const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const TREND_MONTHS = 6;
// Activity that counts as planning/organizing work.
const PLANNING_ACTIONS = ["task.created", "subtask.created", "task.updated"];

export interface MonthSummary {
    month: string;
    timezone: string;
    completed: number;
    completedOnTime: number;
    completedLate: number;
    completedWithoutDeadline: number;
    metWithoutExtending: number;
    // On time, but only after at least one extension.
    onTimeAfterExtending: number;
    // completedOnTime / (completedOnTime + completedLate), or null with nothing to measure.
    onTimeRate: number | null;
    extensions: number;
    planningDays: number;
    daysInMonth: number;
    tasksCreated: number;
    plannedAhead: number;
    plannedAheadRate: number | null;
}

export interface TrendPoint {
    month: string;
    completedOnTime: number;
    completedLate: number;
    extensions: number;
    planningDays: number;
}

// ─── Months ─────────────────────
export const parseMonth = (value: unknown, fallback: string) => {
    if (value === undefined || value === "") return fallback;
    if (typeof value !== "string" || !MONTH_PATTERN.test(value)) throw new AppError("month must look like 2026-10", 400);
    return value;
};

const monthParts = (month: string) => {
    const [, year, monthNumber] = month.match(MONTH_PATTERN)!;
    return { year: Number(year), monthNumber: Number(monthNumber) };
};

export const shiftMonth = (month: string, by: number) => {
    const { year, monthNumber } = monthParts(month);
    const shifted = new Date(Date.UTC(year, monthNumber - 1 + by, 1));
    return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
};

// The month "now" falls in, in that timezone.
export const currentMonth = (timeZone: string, now = new Date()) => {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).formatToParts(now);
    const valueOf = (type: string) => parts.find((part) => part.type === type)!.value;
    return `${valueOf("year")}-${valueOf("month")}`;
};

// [start, end) of the month as instants, from midnight on the 1st in that timezone.
const monthBounds = (month: string, timeZone: string) => {
    const { year, monthNumber } = monthParts(month);
    const next = monthParts(shiftMonth(month, 1));
    return {
        start: zonedWallTimeToUtc(year, monthNumber, 1, 0, 0, timeZone),
        end: zonedWallTimeToUtc(next.year, next.monthNumber, 1, 0, 0, timeZone),
        daysInMonth: new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(),
    };
};

// ─── The numbers ─────────────────────
const yourTasks = (userId: string): Prisma.TaskWhereInput => ({
    workspace: { deletedAt: null },
    OR: [{ assignee: { userId } }, { assigneeMembershipId: null, creatorId: userId }],
});

const ratio = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null);

const countPlanningDays = async (userId: string, timeZone: string, start: Date, end: Date) => {
    // Distinct calendar days in the person's timezone with planning activity.
    const rows = await prisma.$queryRaw<{ days: bigint }[]>`
        SELECT COUNT(DISTINCT (("createdAt" AT TIME ZONE ${timeZone})::date)) AS days
        FROM "Activity"
        WHERE "actorId" = ${userId}::uuid
          AND "action" = ANY(${PLANNING_ACTIONS})
          AND "createdAt" >= ${start} AND "createdAt" < ${end}`;
    return Number(rows[0]?.days ?? 0);
};

export const summarizeMonth = async (userId: string, timeZone: string, month: string): Promise<MonthSummary> => {
    const { start, end, daysInMonth } = monthBounds(month, timeZone);

    const [completedTasks, extensions, planningDays, createdTasks] = await Promise.all([
        prisma.task.findMany({
            where: { ...yourTasks(userId), status: "completed", completedAt: { gte: start, lt: end } },
            select: { completedAt: true, dueAt: true, dueExtensionCount: true },
        }),
        prisma.dueDateExtension.count({ where: { responsibleUserId: userId, createdAt: { gte: start, lt: end }, workspace: { deletedAt: null } } }),
        countPlanningDays(userId, timeZone, start, end),
        prisma.task.findMany({
            where: { creatorId: userId, createdAt: { gte: start, lt: end }, workspace: { deletedAt: null } },
            select: { originalDueAt: true, startAt: true },
        }),
    ]);

    let completedOnTime = 0;
    let completedLate = 0;
    let completedWithoutDeadline = 0;
    let metWithoutExtending = 0;
    for (const task of completedTasks) {
        if (!task.dueAt) {
            completedWithoutDeadline += 1;
        } else if (task.completedAt! <= task.dueAt) {
            completedOnTime += 1;
            if (task.dueExtensionCount === 0) metWithoutExtending += 1;
        } else {
            completedLate += 1;
        }
    }
    const plannedAhead = createdTasks.filter((task) => task.originalDueAt || task.startAt).length;

    return {
        month,
        timezone: timeZone,
        completed: completedTasks.length,
        completedOnTime,
        completedLate,
        completedWithoutDeadline,
        metWithoutExtending,
        onTimeAfterExtending: completedOnTime - metWithoutExtending,
        onTimeRate: ratio(completedOnTime, completedOnTime + completedLate),
        extensions,
        planningDays,
        daysInMonth,
        tasksCreated: createdTasks.length,
        plannedAhead,
        plannedAheadRate: ratio(plannedAhead, createdTasks.length),
    };
};

// The month and the five before it, oldest first — for the trend chart.
export const summarizeTrend = async (userId: string, timeZone: string, month: string): Promise<TrendPoint[]> => {
    const months = Array.from({ length: TREND_MONTHS }, (_, index) => shiftMonth(month, index - (TREND_MONTHS - 1)));
    const summaries = await Promise.all(months.map((trendMonth) => summarizeMonth(userId, timeZone, trendMonth)));
    return summaries.map(({ month: trendMonth, completedOnTime, completedLate, extensions, planningDays }) => ({
        month: trendMonth,
        completedOnTime,
        completedLate,
        extensions,
        planningDays,
    }));
};
