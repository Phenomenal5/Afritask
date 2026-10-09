import validator from "validator";
import prisma from "../config/prisma.js";
import { TaskPriority, TaskStatus, type Prisma } from "../generated/prisma/client.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { requireActiveMembership, requireMembership } from "../middlewares/workspaceAccess.middleware.js";
import { canDeleteTask, canEditTask } from "../utils/taskPermissions.js";
import routeParam from "../utils/routeParam.js";

// ─── Input parsing (formerly the Mongoose schema's casting + enum checks) ─────────────────────
// Each helper throws an operational 400 so bad input never reaches Prisma as a 500.

// NOTE: older clients send "in progress" (the Mongo value) or "in-progress";
// both map to the Postgres enum value "in_progress".
const LEGACY_STATUS_ALIASES: Record<string, TaskStatus> = {
    "in progress": TaskStatus.in_progress,
    "in-progress": TaskStatus.in_progress,
};

const parseStatus = (status: unknown): TaskStatus | undefined => {
    if (status === undefined) return undefined;
    const normalizedStatus = typeof status === "string" ? LEGACY_STATUS_ALIASES[status] ?? status : status;
    if (!Object.values(TaskStatus).includes(normalizedStatus as TaskStatus)) {
        throw new AppError("Please provide a valid status", 400);
    }
    return normalizedStatus as TaskStatus;
};

const parsePriority = (priority: unknown): TaskPriority | undefined => {
    if (priority === undefined) return undefined;
    if (!Object.values(TaskPriority).includes(priority as TaskPriority)) {
        throw new AppError("Please provide a valid priority", 400);
    }
    return priority as TaskPriority;
};

// undefined = leave unchanged, null/"" = clear the deadline.
const parseDeadline = (deadline: unknown): Date | null | undefined => {
    if (deadline === undefined) return undefined;
    if (deadline === null || deadline === "") return null;
    const parsedDeadline = new Date(deadline as string);
    if (Number.isNaN(parsedDeadline.getTime())) {
        throw new AppError("Please provide a valid deadline", 400);
    }
    return parsedDeadline;
};

// Same message Mongoose's CastError produced for a malformed ObjectId.
const assertValidTaskId = (id: string | undefined): string => {
    if (!id || !validator.isUUID(id)) throw new AppError("Invalid id format", 400);
    return id;
};

// ?sort=-createdAt,title  →  [{ createdAt: "desc" }, { title: "asc" }]. Unknown fields are ignored.
const SORTABLE_FIELDS = ["title", "status", "priority", "deadline", "createdAt", "updatedAt"] as const;
const parseSort = (sort: unknown): Prisma.TaskOrderByWithRelationInput[] => {
    if (typeof sort !== "string" || !sort) return [{ createdAt: "desc" }];
    const orderBy = sort.split(",").flatMap((sortField) => {
        const direction = sortField.startsWith("-") ? "desc" : "asc";
        const fieldName = sortField.replace(/^-/, "");
        return (SORTABLE_FIELDS as readonly string[]).includes(fieldName) ? [{ [fieldName]: direction }] : [];
    });
    return orderBy.length > 0 ? orderBy : [{ createdAt: "desc" }];
};


// ─── Load a task the caller may see ─────────────────────
// Item routes (/api/tasks/:id) carry no workspace id, so access is derived from the
// task itself: the caller must be an ACTIVE member of the task's workspace. Missing
// task and "not your workspace" both answer the same 404 (no existence leak).
const loadTaskForMember = async (taskId: string, userId: string) => {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new AppError("Task not found", 404);
    const membership = await requireActiveMembership(task.workspaceId, userId).catch(() => {
        throw new AppError("Task not found", 404);
    });
    return { task, membership };
};


// ─── Workspace collection: /api/workspaces/:workspaceId/tasks ─────────────────────

export const listWorkspaceTasks = catchAsync(async (req, res) => {
    const membership = requireMembership(req);
    const { status, priority, sort } = req.query;

    // Every active member sees every task in the workspace (PRD §8: all projects are
    // shared in V1). The workspaceId filter is the isolation boundary.
    const filter: Prisma.TaskWhereInput = { workspaceId: membership.workspaceId };
    // Query values can arrive as arrays (?status=a&status=b); only a single string is a valid filter.
    if (typeof status === "string" && status) filter.status = parseStatus(status);
    if (typeof priority === "string" && priority) filter.priority = parsePriority(priority);

    const tasks = await prisma.task.findMany({
        where: filter,
        orderBy: parseSort(sort),
    });

    logger.info(`List tasks workspaceId=${membership.workspaceId} userId=${membership.userId} returned ${tasks.length}`);
    res.status(200).json({
        status: "success",
        results: tasks.length,
        data: { tasks }
    });
});

export const createWorkspaceTask = catchAsync(async (req, res, next) => {
    const membership = requireMembership(req);
    const { title, description, status, priority, deadline } = req.body;

    if (!title) {
        logger.warn(`Create task failed: missing title userId=${membership.userId}`);
        return next(new AppError("Please provide a task title", 400));
    }

    const task = await prisma.task.create({
        data: {
            workspaceId: membership.workspaceId,
            creatorId: membership.userId,
            title,
            description: description ?? undefined,
            status: parseStatus(status),
            priority: parsePriority(priority),
            deadline: parseDeadline(deadline),
        },
    });

    logger.info(`Task created taskId=${task.id} workspaceId=${membership.workspaceId} userId=${membership.userId}`);
    res.status(201).json({
        status: "success",
        data: { task }
    });
});

// ─── Single task: /api/tasks/:id ─────────────────────

export const getTaskById = catchAsync(async (req, res) => {
    const id = assertValidTaskId(routeParam(req, "id"));
    const { task } = await loadTaskForMember(id, requireUser(req).id);

    res.status(200).json({
        status: "success",
        data: { task }
    });
});

export const editTask = catchAsync(async (req, res, next) => {
    const id = assertValidTaskId(routeParam(req, "id"));
    const { task: existingTask, membership } = await loadTaskForMember(id, requireUser(req).id);
    const { title, description, status, priority, deadline } = req.body;

    if (!canEditTask(membership, existingTask)) {
        return next(new AppError("You can only edit tasks you created", 403));
    }
    if (title !== undefined && !title) {
        return next(new AppError("Title is required", 400));
    }

    const task = await prisma.task.update({
        where: { id },
        data: {
            title,
            description: description ?? undefined,
            status: parseStatus(status),
            priority: parsePriority(priority),
            deadline: parseDeadline(deadline),
        },
    });

    logger.info(`Task updated taskId=${id} userId=${membership.userId}`);
    res.status(200).json({
        status: "success",
        data: { task }
    });
});

export const updateTaskStatus = catchAsync(async (req, res, next) => {
    const id = assertValidTaskId(routeParam(req, "id"));
    const { task: existingTask, membership } = await loadTaskForMember(id, requireUser(req).id);
    const { status } = req.body;

    if (!canEditTask(membership, existingTask)) {
        return next(new AppError("You can only update tasks you created", 403));
    }
    if (status === undefined) {
        return next(new AppError("Please provide a valid status", 400));
    }

    const task = await prisma.task.update({
        where: { id },
        data: { status: parseStatus(status) },
    });

    logger.info(`Task status updated taskId=${id} userId=${membership.userId} status=${task.status}`);
    res.status(200).json({
        status: "success",
        data: { task }
    });
});

export const deleteTask = catchAsync(async (req, res, next) => {
    const id = assertValidTaskId(routeParam(req, "id"));
    const { task, membership } = await loadTaskForMember(id, requireUser(req).id);

    if (!canDeleteTask(membership, task)) {
        return next(new AppError("You can only delete tasks you created", 403));
    }

    await prisma.task.delete({ where: { id } });

    logger.info(`Task deleted taskId=${id} userId=${membership.userId}`);
    res.status(204).json({
        status: "success",
        data: null
    });
});
