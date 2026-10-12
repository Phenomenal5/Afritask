import prisma from "../config/prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import { zonedWallTimeToUtc } from "../utils/dueDate.js";

// ─── Monthly performance summary ─────────────────────
// Personal numbers for one calendar month in the person's own timezone. Counts only, never
// task titles or content, so a summary can be shared safely.
//
// Scope: a list of workspace ids limits every number to those workspaces (a share link's
// chosen workspaces, a team view of one workspace). `null` covers every workspace the
// person has worked in, including ones they've since left.
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
// - after the original due date: completed after the first deadline the task had, whether
//                               it was then extended or simply late

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
    // Finished after the task's FIRST deadline (extended or late).
    completedAfterOriginalDue: number;
    // Of `completed`, how many were subtasks.
    subtasksCompleted: number;
    projectsCreated: number;
    commentsWritten: number;
}

// null = every workspace; otherwise only these.
export type WorkspaceScope = string[] | null;

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
    if (typeof value !== "string" || !MONTH_PATTERN.test(value)) throw new AppError("We couldn't read that month. Pick one from the list.", 400);
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
// NOTE: every query below takes inScope(scope); a count that skipped it would leak work
// from other workspaces into a team view or a share link.
const inScope = (scope: WorkspaceScope) => ({ workspace: { deletedAt: null }, ...(scope && { workspaceId: { in: scope } }) });

const yourTasks = (userId: string, scope: WorkspaceScope): Prisma.TaskWhereInput => ({
    ...inScope(scope),
    OR: [{ assignee: { userId } }, { assigneeMembershipId: null, creatorId: userId }],
});

const ratio = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null);

const countPlanningDays = async (userId: string, timeZone: string, start: Date, end: Date, scope: WorkspaceScope) => {
    // Distinct calendar days in the person's timezone with planning activity.
    // The scope is bound as a uuid[] parameter, never interpolated as text.
    const scopeFilter = scope ? Prisma.sql`AND "workspaceId" = ANY(${scope}::uuid[])` : Prisma.empty;
    const rows = await prisma.$queryRaw<{ days: bigint }[]>`
        SELECT COUNT(DISTINCT (("createdAt" AT TIME ZONE ${timeZone})::date)) AS days
        FROM "Activity"
        WHERE "actorId" = ${userId}::uuid
          AND "action" = ANY(${PLANNING_ACTIONS})
          AND "createdAt" >= ${start} AND "createdAt" < ${end}
          ${scopeFilter}`;
    return Number(rows[0]?.days ?? 0);
};

export const summarizeMonth = async (userId: string, timeZone: string, month: string, scope: WorkspaceScope = null): Promise<MonthSummary> => {
    const { start, end, daysInMonth } = monthBounds(month, timeZone);
    const thisMonth = { gte: start, lt: end };

    const [completedTasks, extensions, planningDays, createdTasks, projectsCreated, commentsWritten] = await Promise.all([
        prisma.task.findMany({
            where: { ...yourTasks(userId, scope), status: "completed", completedAt: thisMonth },
            select: { completedAt: true, dueAt: true, originalDueAt: true, dueExtensionCount: true, parentTaskId: true },
        }),
        prisma.dueDateExtension.count({ where: { ...inScope(scope), responsibleUserId: userId, createdAt: thisMonth } }),
        countPlanningDays(userId, timeZone, start, end, scope),
        prisma.task.findMany({
            where: { ...inScope(scope), creatorId: userId, createdAt: thisMonth },
            select: { originalDueAt: true, startAt: true },
        }),
        prisma.project.count({ where: { ...inScope(scope), createdById: userId, createdAt: thisMonth } }),
        prisma.comment.count({ where: { ...inScope(scope), authorId: userId, deletedAt: null, createdAt: thisMonth } }),
    ]);

    let completedOnTime = 0;
    let completedLate = 0;
    let completedWithoutDeadline = 0;
    let metWithoutExtending = 0;
    let completedAfterOriginalDue = 0;
    for (const task of completedTasks) {
        if (!task.dueAt) {
            completedWithoutDeadline += 1;
        } else if (task.completedAt! <= task.dueAt) {
            completedOnTime += 1;
            if (task.dueExtensionCount === 0) metWithoutExtending += 1;
        } else {
            completedLate += 1;
        }
        // The first deadline it ever had (older tasks may only have the current one).
        const firstDeadline = task.originalDueAt ?? task.dueAt;
        if (firstDeadline && task.completedAt! > firstDeadline) completedAfterOriginalDue += 1;
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
        completedAfterOriginalDue,
        subtasksCompleted: completedTasks.filter((task) => task.parentTaskId).length,
        projectsCreated,
        commentsWritten,
    };
};

// The month and the five before it, oldest first — for the trend chart.
export const summarizeTrend = async (userId: string, timeZone: string, month: string, scope: WorkspaceScope = null): Promise<TrendPoint[]> => {
    const months = Array.from({ length: TREND_MONTHS }, (_, index) => shiftMonth(month, index - (TREND_MONTHS - 1)));
    const summaries = await Promise.all(months.map((trendMonth) => summarizeMonth(userId, timeZone, trendMonth, scope)));
    return summaries.map(({ month: trendMonth, completedOnTime, completedLate, extensions, planningDays }) => ({
        month: trendMonth,
        completedOnTime,
        completedLate,
        extensions,
        planningDays,
    }));
};
