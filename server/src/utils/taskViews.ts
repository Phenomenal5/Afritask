import { TaskStatus, type Prisma } from "../generated/prisma/client.js";
import { zonedWallTimeToUtc } from "./dueDate.js";

// ─── Due-date views (SRS SR11 My Tasks, SR14 counts) ─────────────────────
// - "today" is the VIEWER's local calendar date; "overdue" is judged by the due instant.
//   A task due earlier today is in BOTH (SRS SR11 acceptance: "an overdue item can also
//   appear under Today with clear labels").
// - Every view except "completed"/"week" covers open work only.
// - "week" = completed Monday 00:00 → now, in the viewer's timezone (SRS SR14).

// "scheduled" = open work planned to START later (a future startAt) — the "I'll begin it
// tomorrow" list.
export const DUE_VIEWS = ["open", "today", "upcoming", "overdue", "none", "completed", "week", "scheduled"] as const;
export type DueView = (typeof DUE_VIEWS)[number];

export const isDueView = (value: unknown): value is DueView => typeof value === "string" && (DUE_VIEWS as readonly string[]).includes(value);

const WEEKDAY_INDEX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

// Midnight today, midnight tomorrow and Monday midnight, as UTC instants, for `timeZone`.
export const dayBounds = (now: Date, timeZone: string) => {
    const [year, month, day] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
        .format(now)
        .split("-")
        .map(Number) as [number, number, number];
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
    // Date.UTC normalises day overflow (month ends, Monday in the previous month).
    const midnightOf = (dayOffset: number) => {
        const date = new Date(Date.UTC(year, month - 1, day + dayOffset));
        return zonedWallTimeToUtc(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), 0, 0, timeZone);
    };
    return {
        startOfToday: midnightOf(0),
        startOfTomorrow: midnightOf(1),
        startOfWeek: midnightOf(-(WEEKDAY_INDEX[weekday] ?? 0)),
    };
};

const OPEN: Prisma.TaskWhereInput = { status: { not: TaskStatus.completed } };

// The Prisma condition for one view, to be AND-ed with the caller's other filters.
export const dueViewWhere = (view: DueView, now: Date, timeZone: string): Prisma.TaskWhereInput => {
    const { startOfToday, startOfTomorrow, startOfWeek } = dayBounds(now, timeZone);
    switch (view) {
        case "open":
            return OPEN;
        case "today":
            return { ...OPEN, dueAt: { gte: startOfToday, lt: startOfTomorrow } };
        case "upcoming":
            return { ...OPEN, dueAt: { gte: startOfTomorrow } };
        case "overdue":
            return { ...OPEN, dueAt: { lt: now } };
        case "none":
            return { ...OPEN, dueAt: null };
        case "completed":
            return { status: TaskStatus.completed };
        case "week":
            return { status: TaskStatus.completed, completedAt: { gte: startOfWeek } };
        case "scheduled":
            return { ...OPEN, startAt: { gt: now } };
    }
};
