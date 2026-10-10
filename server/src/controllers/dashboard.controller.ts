import prisma from "../config/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";
import catchAsync from "../utils/catchAsync.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { requireMembership } from "../middlewares/workspaceAccess.middleware.js";
import { dueViewWhere } from "../utils/taskViews.js";

// ─── Dashboard counts (SRS SR14) ─────────────────────
// Every number is built from the SAME conditions as the task list it links to
// (GET /workspaces/:id/tasks with the matching ?assignee/?due/?status), so a count and its
// drill-down can't disagree. Rules:
// - Archived projects are left out everywhere.
// - Workspace and project figures count TOP-LEVEL tasks only, so separately assigned
//   subtasks don't inflate project totals.
// - Personal figures count what's assigned to you, subtasks included — exactly what My
//   Tasks lists when you click through.
// - "This week" is Monday 00:00 → now in your profile timezone.

const notArchived: Prisma.TaskWhereInput = { OR: [{ projectId: null }, { project: { state: { not: "archived" } } }] };

export const getWorkspaceDashboard = catchAsync(async (req, res) => {
    const membership = requireMembership(req);
    const user = requireUser(req);
    const now = new Date();
    const timeZone = user.timezone || "UTC";

    const workspaceBase: Prisma.TaskWhereInput[] = [{ workspaceId: membership.workspaceId }, notArchived];
    const mine: Prisma.TaskWhereInput[] = [...workspaceBase, { assigneeMembershipId: membership.id }];
    const topLevel: Prisma.TaskWhereInput[] = [...workspaceBase, { parentTaskId: null }];
    const count = (conditions: Prisma.TaskWhereInput[]) => prisma.task.count({ where: { AND: conditions } });

    const [dueToday, overdue, inProgress, completedThisWeek, workspaceOpen, workspaceCompleted, workspaceOverdue, activeProjects, projects] =
        await Promise.all([
            count([...mine, dueViewWhere("today", now, timeZone)]),
            count([...mine, dueViewWhere("overdue", now, timeZone)]),
            count([...mine, { status: "in_progress" }]),
            count([...mine, dueViewWhere("week", now, timeZone)]),
            count([...topLevel, dueViewWhere("open", now, timeZone)]),
            count([...topLevel, dueViewWhere("completed", now, timeZone)]),
            count([...topLevel, dueViewWhere("overdue", now, timeZone)]),
            prisma.project.count({ where: { workspaceId: membership.workspaceId, state: "active" } }),
            prisma.project.findMany({
                where: { workspaceId: membership.workspaceId, state: { not: "archived" } },
                select: { id: true, name: true, state: true },
                orderBy: [{ state: "asc" }, { createdAt: "desc" }],
            }),
        ]);

    // Per-project progress: completed top-level ÷ total top-level. An empty project has no
    // percentage (null), not "0%" — it hasn't started, it isn't failing (SRS SR14).
    const grouped = projects.length
        ? await prisma.task.groupBy({
            by: ["projectId", "status"],
            where: { projectId: { in: projects.map((project) => project.id) }, parentTaskId: null },
            _count: { _all: true },
        })
        : [];
    const projectProgress = projects.map((project) => {
        const rows = grouped.filter((row) => row.projectId === project.id);
        const total = rows.reduce((sum, row) => sum + row._count._all, 0);
        const completed = rows.filter((row) => row.status === "completed").reduce((sum, row) => sum + row._count._all, 0);
        return { ...project, total, completed, open: total - completed, percentComplete: total ? Math.round((completed / total) * 100) : null };
    });

    res.status(200).json({
        status: "success",
        data: {
            generatedAt: now,
            timezone: timeZone,
            personal: { dueToday, overdue, inProgress, completedThisWeek },
            workspace: { open: workspaceOpen, completed: workspaceCompleted, overdue: workspaceOverdue, activeProjects },
            projects: projectProgress,
        },
    });
});
