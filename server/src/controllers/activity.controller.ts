import validator from "validator";
import prisma from "../config/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import routeParam from "../utils/routeParam.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { requireMembership } from "../middlewares/workspaceAccess.middleware.js";
import { loadTaskForMember } from "./task.controller.js";

// ─── Activity history, read-only (SRS SR09) ─────────────────────
// Every active member can read their workspace's history (all work is shared in V1).
// There are deliberately no write routes: entries are created only by the changes themselves.

const DEFAULT_PAGE_SIZE = 30;
const MAX_PAGE_SIZE = 100;

const activitySelect = {
    id: true,
    action: true,
    entityType: true,
    entityId: true,
    projectId: true,
    changes: true,
    summary: true,
    createdAt: true,
    actor: { select: { id: true, name: true, photo: true } },
} as const satisfies Prisma.ActivitySelect;

// Newest first, keyset-paginated: ?before=<id of the last entry you have>. uuid7 ids are
// time-ordered, but createdAt leads the sort so the index on (…, createdAt) does the work.
const findActivityPage = async (where: Prisma.ActivityWhereInput, query: Record<string, unknown>) => {
    const requestedLimit = Number(query.limit);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;
    const before = typeof query.before === "string" && validator.isUUID(query.before) ? query.before : undefined;

    // One extra row tells us whether another page exists without a count query.
    const rows = await prisma.activity.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(before && { cursor: { id: before }, skip: 1 }),
        select: activitySelect,
    });
    const entries = rows.slice(0, limit);
    return { entries, nextCursor: rows.length > limit ? entries[entries.length - 1].id : null };
};

// ─── GET /api/tasks/:id/activity ─────────────────────
export const listTaskActivity = catchAsync(async (req, res) => {
    const taskId = routeParam(req, "id");
    if (!taskId || !validator.isUUID(taskId)) throw new AppError("We couldn't find that task. Refresh to see the latest.", 400);
    const { task } = await loadTaskForMember(taskId, requireUser(req).id);

    const page = await findActivityPage({ workspaceId: task.workspaceId, entityType: "task", entityId: task.id }, req.query);
    res.status(200).json({ status: "success", data: page });
});

// ─── GET /api/workspaces/:workspaceId/activity?projectId= ─────────────────────
// The workspace feed, or one project's (the project's own events plus its tasks').
export const listWorkspaceActivity = catchAsync(async (req, res) => {
    const membership = requireMembership(req);
    const { projectId } = req.query;

    const where: Prisma.ActivityWhereInput = { workspaceId: membership.workspaceId };
    if (typeof projectId === "string" && validator.isUUID(projectId)) where.projectId = projectId;

    const page = await findActivityPage(where, req.query);
    res.status(200).json({ status: "success", data: page });
});
