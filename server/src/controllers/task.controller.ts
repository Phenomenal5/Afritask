import validator from "validator";
import prisma from "../config/prisma.js";
import { TaskPriority, TaskStatus, type Prisma } from "../generated/prisma/client.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js";
import { requireUser } from "../middlewares/auth.middleware.js";
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


export const createTask = catchAsync(async (req, res, next) => {
    const { title, description, status, priority, deadline } = req.body;
    const userId = requireUser(req).id;
    logger.info(`Create task requested by userId=${userId}, title=${title}`);
    try {
        if (!title) {
            logger.warn(`Create task failed: missing title for userId=${userId}`);
            return next(new AppError("Please provide a task title", 400));
        }

        const task = await prisma.task.create({
            data: {
                userId,
                title,
                description: description ?? undefined,
                status: parseStatus(status),
                priority: parsePriority(priority),
                deadline: parseDeadline(deadline),
            },
        });

        logger.info(`Task created successfully for userId=${userId}, taskId=${task.id}`);
        res.status(201).json({
            status: "success",
            data: { task }
        });
    } catch (error) {
        return next(error);
    }
});

export const editTask = catchAsync(async (req, res, next) => {
    try {
        const id = assertValidTaskId(routeParam(req, "id"));
        const userId = requireUser(req).id;
        const { title, description, status, priority, deadline } = req.body;

        if (title !== undefined && !title) {
            return next(new AppError("Title is required", 400));
        }

        // Always include the owner in the query so users can only edit their own tasks.
        // updateMany (not update) because update's `where` only accepts unique fields.
        const { count } = await prisma.task.updateMany({
            where: { id, userId },
            data: {
                title,
                description: description ?? undefined,
                status: parseStatus(status),
                priority: parsePriority(priority),
                deadline: parseDeadline(deadline),
            },
        });
        if (count === 0) {
            logger.warn(`Edit task failed: task not found taskId=${id} userId=${userId}`);
            return next(new AppError("Task not found", 404));
        }

        const task = await prisma.task.findUnique({ where: { id } });

        logger.info(`Task updated successfully taskId=${id} userId=${userId}`);
        res.status(200).json({
            status: "success",
            data: { task }
        });
    } catch (error) {
        return next(error);
    }
});

export const updateTaskStatus = catchAsync(async (req, res, next) => {
    try {
        const id = assertValidTaskId(routeParam(req, "id"));
        const { status } = req.body;
        const userId = requireUser(req).id;

        if (status === undefined) {
            logger.warn(`Invalid status update attempt for taskId=${id} userId=${userId}, status=${status}`);
            return next(new AppError("Please provide a valid status", 400));
        }
        const normalizedStatus = parseStatus(status);

        // The owner condition prevents updating another user's task by id.
        const { count } = await prisma.task.updateMany({
            where: { id, userId },
            data: { status: normalizedStatus },
        });

        if (count === 0) {
            logger.warn(`Update task status failed: task not found taskId=${id} userId=${userId}`);
            return next(new AppError("Task not found", 404));
        }

        const task = await prisma.task.findUnique({ where: { id } });

        logger.info(`Task status updated successfully taskId=${id} userId=${userId} status=${normalizedStatus}`);
        res.status(200).json({
            status: "success",
            data: { task }
        });
    } catch (error) {
        return next(error);
    }
});

export const deleteTask = catchAsync(async (req, res, next) => {
    try {
        const id = assertValidTaskId(routeParam(req, "id"));
        const userId = requireUser(req).id;

        // The owner condition prevents deleting another user's task by id.
        const { count } = await prisma.task.deleteMany({ where: { id, userId } });

        if (count === 0) {
            logger.warn(`Delete task failed: task not found taskId=${id} userId=${userId}`);
            return next(new AppError("Task not found", 404));
        }

        logger.info(`Task deleted successfully taskId=${id} userId=${userId}`);
        res.status(204).json({
            status: "success",
            data: null
        });
    } catch (error) {
        return next(error);
    }
});

export const getTaskById = catchAsync(async (req, res, next) => {
    try {
        const id = assertValidTaskId(routeParam(req, "id"));
        const userId = requireUser(req).id;

        // The owner condition prevents reading another user's task by id.
        const task = await prisma.task.findFirst({ where: { id, userId } });
        if (!task) {
            logger.warn(`Get task by id failed: task not found taskId=${id} userId=${userId}`);
            return next(new AppError("Task not found", 404));
        }

        logger.info(`Task retrieved successfully taskId=${id} userId=${userId}`);
        res.status(200).json({
            status: "success",
            data: { task }
        });
    } catch (error) {
        return next(error);
    }
});

export const getAllTask = catchAsync(async (req, res, next) => {
    try {
        const userId = requireUser(req).id;
        const { status, priority, sort } = req.query;

        // List only tasks owned by the authenticated user.
        const filter: Prisma.TaskWhereInput = { userId };
        // Query values can arrive as arrays (?status=a&status=b); only a single string is a valid filter.
        if (typeof status === "string" && status) filter.status = parseStatus(status);
        if (typeof priority === "string" && priority) filter.priority = parsePriority(priority);

        const tasks = await prisma.task.findMany({
            where: filter,
            orderBy: parseSort(sort),
        });

        logger.info(`Get all tasks for userId=${userId} returned ${tasks.length} tasks`);
        res.status(200).json({
            status: "success",
            results: tasks.length,
            data: { tasks }
        });
    } catch (error) {
        return next(error);
    }
});
