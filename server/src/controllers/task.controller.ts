import Task, { type ITask, type TaskStatus } from "../models/Task.js";
import type { QueryFilter } from "mongoose";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js";
import { requireUser } from "../middlewares/auth.middleware.js";

// The client once sent "in-progress"; the stored value has a space.
const normalizeStatus = (status?: string) => (status === "in-progress" ? "in progress" : status) as TaskStatus | undefined;

export const createTask = catchAsync(async (req, res, next) => {
    const { title, description, status, priority, deadline } = req.body;
    const userId = requireUser(req).id;
    logger.info(`Create task requested by userId=${userId}, title=${title}`);
    try {
        if (!title) {
            logger.warn(`Create task failed: missing title for userId=${userId}`);
            return next(new AppError("Please provide a task title", 400));
        }

        const task = await Task.create({
            user: userId,
            title,
            description,
            status: normalizeStatus(status),
            priority,
            deadline
        });

        logger.info(`Task created successfully for userId=${userId}, taskId=${task._id}`);
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
        const { id } = req.params;
        const userId = requireUser(req).id;
        const { title, description, status, priority, deadline } = req.body;

        // Always include user in the query so users can only edit their own tasks.
        const task = await Task.findOne({ _id: id, user: userId });
        if (!task) {
            logger.warn(`Edit task failed: task not found taskId=${id} userId=${userId}`);
            return next(new AppError("Task not found", 404));
        }

        if (title !== undefined) task.title = title;
        if (description !== undefined) task.description = description;
        if (status !== undefined) task.status = normalizeStatus(status) ?? task.status;
        if (priority !== undefined) task.priority = priority;
        if (deadline !== undefined) task.deadline = deadline;

        await task.save();

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
        const { id } = req.params;
        const { status } = req.body;
        const userId = requireUser(req).id;
        const normalizedStatus = normalizeStatus(status);

        const allowedStatuses = ["pending", "in progress", "completed"];
        if (!normalizedStatus || !allowedStatuses.includes(normalizedStatus)) {
            logger.warn(`Invalid status update attempt for taskId=${id} userId=${userId}, status=${status}`);
            return next(new AppError("Please provide a valid status", 400));
        }

        // The user condition prevents updating another user's task by id.
        const task = await Task.findOneAndUpdate(
            { _id: id, user: userId },
            { status: normalizedStatus },
            { new: true, runValidators: true }
        );

        if (!task) {
            logger.warn(`Update task status failed: task not found taskId=${id} userId=${userId}`);
            return next(new AppError("Task not found", 404));
        }

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
        const { id } = req.params;
        const userId = requireUser(req).id;

        // The user condition prevents deleting another user's task by id.
        const task = await Task.findOneAndDelete({ _id: id, user: userId });

        if (!task) {
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
        const { id } = req.params;
        const userId = requireUser(req).id;

        // The user condition prevents reading another user's task by id.
        const task = await Task.findOne({ _id: id, user: userId });
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
        const filter: QueryFilter<ITask> = { user: userId };
        // Query values can arrive as arrays (?status=a&status=b); only a single string is a valid filter.
        if (typeof status === "string" && status) filter.status = status as ITask["status"];
        if (typeof priority === "string" && priority) filter.priority = priority as ITask["priority"];

        let query = Task.find(filter);

        if (typeof sort === "string" && sort) {
            query = query.sort(sort.split(",").join(" "));
        } else {
            query = query.sort("-createdAt");
        }

        const tasks = await query;

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
