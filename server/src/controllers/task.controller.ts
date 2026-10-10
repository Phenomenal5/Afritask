import validator from "validator";
import prisma from "../config/prisma.js";
import { Prisma, TaskPriority, TaskStatus, type Task } from "../generated/prisma/client.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { requireActiveMembership, requireMembership } from "../middlewares/workspaceAccess.middleware.js";
import { canAssignTask, canDeleteTask, canEditTask } from "../utils/taskPermissions.js";
import { parseDue } from "../utils/dueDate.js";
import routeParam from "../utils/routeParam.js";
import { diffFields, recordActivity } from "../services/activityService.js";

// ─── Input parsing ─────────────────────
// Each helper throws an operational 400 so bad input never reaches Prisma as a 500.
// PRD §9 proposed limits: title 1–200 characters, description up to 20,000.

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 20_000;

// NOTE: older clients send the Mongo-era values: "pending" (now todo) and
// "in progress" / "in-progress" (now in_progress).
const LEGACY_STATUS_ALIASES: Record<string, TaskStatus> = {
    pending: TaskStatus.todo,
    "in progress": TaskStatus.in_progress,
    "in-progress": TaskStatus.in_progress,
};

const parseStatus = (status: unknown): TaskStatus | undefined => {
    if (status === undefined) return undefined;
    const normalizedStatus = typeof status === "string" ? LEGACY_STATUS_ALIASES[status] ?? status : status;
    if (!Object.values(TaskStatus).includes(normalizedStatus as TaskStatus)) {
        throw new AppError("Status must be todo, in_progress, in_review or completed", 400);
    }
    return normalizedStatus as TaskStatus;
};

const parsePriority = (priority: unknown): TaskPriority | undefined => {
    if (priority === undefined) return undefined;
    if (!Object.values(TaskPriority).includes(priority as TaskPriority)) {
        throw new AppError("Priority must be low, medium, high or urgent", 400);
    }
    return priority as TaskPriority;
};

const parseTitle = (title: unknown, { required }: { required: boolean }): string | undefined => {
    if (title === undefined && !required) return undefined;
    const trimmedTitle = typeof title === "string" ? title.trim() : "";
    if (!trimmedTitle) throw new AppError("Please provide a task title", 400);
    if (trimmedTitle.length > TITLE_MAX_LENGTH) throw new AppError(`Title must be ${TITLE_MAX_LENGTH} characters or fewer`, 400);
    return trimmedTitle;
};

const parseDescription = (description: unknown): string | undefined => {
    if (description === undefined) return undefined;
    if (description === null) return "";
    if (typeof description !== "string") throw new AppError("Description must be text", 400);
    if (description.length > DESCRIPTION_MAX_LENGTH) throw new AppError("Description is too long", 400);
    return description;
};

// Same message Mongoose's CastError produced for a malformed ObjectId.
const assertValidTaskId = (id: string | undefined): string => {
    if (!id || !validator.isUUID(id)) throw new AppError("Invalid id format", 400);
    return id;
};

// SRS SR06: every write names the version it was based on, so a stale edit can't
// silently overwrite a newer one.
const parseExpectedVersion = (version: unknown): number => {
    const expectedVersion = Number(version);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        throw new AppError("Please include the task's current version", 400);
    }
    return expectedVersion;
};

// ?sort=-createdAt,title → [{ createdAt: "desc" }, { title: "asc" }]. "deadline" is the
// legacy name for dueAt. Unknown fields are ignored. id is the stable tie-breaker.
const SORTABLE_FIELDS: Record<string, keyof Task> = {
    title: "title",
    status: "status",
    priority: "priority",
    dueAt: "dueAt",
    deadline: "dueAt",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
};
const parseSort = (sort: unknown): Prisma.TaskOrderByWithRelationInput[] => {
    const orderBy = typeof sort === "string" && sort
        ? sort.split(",").flatMap((sortField) => {
            const fieldName = SORTABLE_FIELDS[sortField.replace(/^-/, "")];
            if (!fieldName) return [];
            return [{ [fieldName]: sortField.startsWith("-") ? "desc" : "asc" } as Prisma.TaskOrderByWithRelationInput];
        })
        : [];
    return [...(orderBy.length > 0 ? orderBy : [{ createdAt: "desc" as const }]), { id: "asc" }];
};

// ─── Loading + shared rules ─────────────────────

// Item routes (/api/tasks/:id) carry no workspace id, so access is derived from the
// task itself: the caller must be an ACTIVE member of the task's workspace. Missing
// task and "not your workspace" both answer the same 404 (no existence leak).
export const loadTaskForMember = async (taskId: string, userId: string) => {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) throw new AppError("Task not found", 404);
    const membership = await requireActiveMembership(task.workspaceId, userId).catch(() => {
        throw new AppError("Task not found", 404);
    });
    return { task, membership };
};

// Returned with every task: its project (to show it and know it's read-only), the
// assignee's public identity, its labels, its parent (for subtasks) and subtask progress.
const assigneeSelect = { select: { id: true, user: { select: { id: true, name: true, photo: true } } } } as const;
const taskInclude = {
    project: { select: { id: true, name: true, state: true } },
    assignee: assigneeSelect,
    labels: { select: { label: { select: { id: true, name: true, color: true } } }, orderBy: { label: { name: "asc" } } },
    parent: { select: { id: true, title: true } },
    subtasks: { select: { status: true } },
} as const satisfies Prisma.TaskInclude;

// The include's relations, whatever scalar fields the query returned (the global omit
// removes some, which Prisma.TaskGetPayload doesn't model — hence a structural type).
interface TaskRelations {
    labels: { label: { id: string; name: string; color: string } }[];
    subtasks: { status: TaskStatus }[];
}

// API shape: labels flattened, subtask list replaced by counts (the detail route adds the list).
const toTaskResponse = <TaskRow extends TaskRelations>(task: TaskRow) => {
    const { labels, subtasks, ...fields } = task;
    return {
        ...fields,
        labels: labels.map((taskLabel) => taskLabel.label),
        subtaskCounts: {
            total: subtasks.length,
            completed: subtasks.filter((subtask) => subtask.status === TaskStatus.completed).length,
        },
    };
};

// What a task looked like, in the terms history shows: names rather than ids, so a
// later rename or removal doesn't change what an old entry says (SRS SR09).
interface TaskHistoryRow extends TaskRelations {
    title: string;
    description: string;
    status: TaskStatus;
    priority: TaskPriority;
    dueAt: Date | null;
    project: { name: string } | null;
    assignee: { user: { name: string } } | null;
}
const HISTORY_FIELDS = ["title", "description", "status", "priority", "dueAt", "project", "assignee", "labels"] as const;
const toHistorySnapshot = (task: TaskHistoryRow) => ({
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    dueAt: task.dueAt,
    project: task.project?.name ?? null,
    assignee: task.assignee?.user.name ?? null,
    labels: task.labels.map((taskLabel) => taskLabel.label.name),
});

const findTaskResponse = async (taskId: string) => {
    const task = await prisma.task.findUnique({ where: { id: taskId }, include: taskInclude });
    return task ? toTaskResponse(task) : null;
};

// Label ids must all belong to the task's workspace. undefined = leave labels unchanged,
// [] = remove all. Duplicates are ignored.
const parseLabelIds = async (labelIds: unknown, workspaceId: string): Promise<string[] | undefined> => {
    if (labelIds === undefined) return undefined;
    if (!Array.isArray(labelIds) || !labelIds.every((labelId) => typeof labelId === "string" && validator.isUUID(labelId))) {
        throw new AppError("labelIds must be a list of label ids", 400);
    }
    const uniqueLabelIds = [...new Set(labelIds as string[])];
    const found = await prisma.label.count({ where: { id: { in: uniqueLabelIds }, workspaceId } });
    if (found !== uniqueLabelIds.length) throw new AppError("Label not found", 400);
    return uniqueLabelIds;
};

// NOTE: archived projects are read-only, tasks included (PRD §8 protection rules).
const assertTaskWritable = async (task: { projectId: string | null }) => {
    if (!task.projectId) return;
    const project = await prisma.project.findUnique({ where: { id: task.projectId }, select: { state: true } });
    if (project?.state === "archived") {
        throw new AppError("This task's project is archived. Restore the project to make changes.", 409);
    }
};

// A task's project must be in the SAME workspace and not archived. undefined = unchanged,
// null/"" = no project. Anything from another workspace answers like a missing project.
const parseProjectId = async (projectId: unknown, workspaceId: string): Promise<string | null | undefined> => {
    if (projectId === undefined) return undefined;
    if (projectId === null || projectId === "") return null;
    if (typeof projectId !== "string" || !validator.isUUID(projectId)) throw new AppError("Project not found", 400);
    const project = await prisma.project.findFirst({ where: { id: projectId, workspaceId }, select: { state: true } });
    if (!project) throw new AppError("Project not found", 400);
    if (project.state === "archived") throw new AppError("Can't add tasks to an archived project", 409);
    return projectId;
};

// The assignee must be an ACTIVE member of the task's workspace (PRD FR06). undefined =
// unchanged, null/"" = unassigned. Membership ids from other workspaces look missing.
const parseAssigneeMembershipId = async (assigneeMembershipId: unknown, workspaceId: string): Promise<string | null | undefined> => {
    if (assigneeMembershipId === undefined) return undefined;
    if (assigneeMembershipId === null || assigneeMembershipId === "") return null;
    if (typeof assigneeMembershipId !== "string" || !validator.isUUID(assigneeMembershipId)) {
        throw new AppError("Assignee must be an active member of this workspace", 400);
    }
    const assignee = await prisma.membership.findFirst({
        where: { id: assigneeMembershipId, workspaceId, status: "active" },
        select: { id: true },
    });
    if (!assignee) throw new AppError("Assignee must be an active member of this workspace", 400);
    return assigneeMembershipId;
};

// Entering Completed records the time; leaving it clears it (PRD FR06). Unchanged → no-op.
const completionChange = (previousStatus: TaskStatus, nextStatus: TaskStatus | undefined) => {
    if (!nextStatus || nextStatus === previousStatus) return {};
    if (nextStatus === TaskStatus.completed) return { completedAt: new Date() };
    if (previousStatus === TaskStatus.completed) return { completedAt: null };
    return {};
};

// Apply a versioned update: succeeds only if nobody changed the task since `expectedVersion`.
// `alsoInTransaction` runs related writes (labels, subtasks following a project move) in the
// SAME transaction, so a version conflict rolls them back too. The before/after history
// entry is written there as well — only when something actually changed.
const updateWithVersionCheck = async (
    taskId: string,
    expectedVersion: number,
    actorId: string,
    data: Prisma.TaskUncheckedUpdateManyInput,
    alsoInTransaction?: (tx: Prisma.TransactionClient) => Promise<unknown>
) => {
    await prisma.$transaction(async (tx) => {
        const before = await tx.task.findUnique({ where: { id: taskId }, include: taskInclude });
        const { count } = await tx.task.updateMany({
            where: { id: taskId, version: expectedVersion },
            data: { ...data, version: { increment: 1 } },
        });
        if (count === 0 || !before) {
            throw new AppError("This task was changed by someone else. Refresh to see the latest version and try again.", 409);
        }
        if (alsoInTransaction) await alsoInTransaction(tx);

        const after = await tx.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
        const changes = diffFields(toHistorySnapshot(before), toHistorySnapshot(after), [...HISTORY_FIELDS]);
        if (Object.keys(changes).length > 0) {
            await recordActivity(tx, {
                workspaceId: after.workspaceId,
                actorId,
                entityType: "task",
                entityId: taskId,
                projectId: after.projectId,
                action: "task.updated",
                changes,
                summary: after.title,
            });
        }
    });
    return findTaskResponse(taskId);
};

const replaceLabels = (tx: Prisma.TransactionClient, taskId: string, labelIds: string[]) =>
    tx.taskLabel.deleteMany({ where: { taskId } }).then(() =>
        labelIds.length > 0 ? tx.taskLabel.createMany({ data: labelIds.map((labelId) => ({ taskId, labelId })) }) : null
    );

// ─── Workspace collection: /api/workspaces/:workspaceId/tasks ─────────────────────

export const listWorkspaceTasks = catchAsync(async (req, res) => {
    const membership = requireMembership(req);
    const { status, priority, sort, projectId, assignee, labelId, includeSubtasks } = req.query;

    // Every active member sees every task in the workspace (PRD §8: all projects are
    // shared in V1). The workspaceId filter is the isolation boundary.
    const filter: Prisma.TaskWhereInput = { workspaceId: membership.workspaceId };
    if (projectId === "none") {
        filter.projectId = null;
    } else if (typeof projectId === "string" && validator.isUUID(projectId)) {
        filter.projectId = projectId;
    } else {
        // Workspace-wide lists leave out archived projects' tasks (PRD FR14: archived
        // excluded by default). Asking for one project by id still shows them, read-only.
        filter.OR = [{ projectId: null }, { project: { state: { not: "archived" } } }];
    }
    // Query values can arrive as arrays (?status=a&status=b); only a single string is a valid filter.
    if (typeof status === "string" && status) filter.status = parseStatus(status);
    if (typeof priority === "string" && priority) filter.priority = parsePriority(priority);
    if (assignee === "me") filter.assigneeMembershipId = membership.id;
    else if (assignee === "none") filter.assigneeMembershipId = null;
    else if (typeof assignee === "string" && validator.isUUID(assignee)) filter.assigneeMembershipId = assignee;
    if (typeof labelId === "string" && validator.isUUID(labelId)) filter.labels = { some: { labelId } };

    // Lists and boards show TOP-LEVEL tasks; subtasks live inside their parent (PRD FR12).
    // Asking "what's assigned to someone" includes separately assigned subtasks (PRD FR11),
    // which carry `parent` for context.
    const wantsSubtasks = includeSubtasks === "true" || (typeof assignee === "string" && assignee !== "none");
    if (!wantsSubtasks) filter.parentTaskId = null;

    const tasks = await prisma.task.findMany({
        where: filter,
        orderBy: parseSort(sort),
        include: taskInclude,
    });

    logger.info(`List tasks workspaceId=${membership.workspaceId} userId=${membership.userId} returned ${tasks.length}`);
    res.status(200).json({
        status: "success",
        results: tasks.length,
        data: { tasks: tasks.map(toTaskResponse) }
    });
});

export const createWorkspaceTask = catchAsync(async (req, res) => {
    const membership = requireMembership(req);
    const user = requireUser(req);
    const { clientRequestId } = req.body;

    if (clientRequestId !== undefined && clientRequestId !== null
        && (typeof clientRequestId !== "string" || clientRequestId.length > 100)) {
        throw new AppError("clientRequestId must be a string of up to 100 characters", 400);
    }

    const findByRequestId = async () => {
        const task = await prisma.task.findUnique({
            where: { workspaceId_clientRequestId: { workspaceId: membership.workspaceId, clientRequestId } },
            include: taskInclude,
        });
        return task ? toTaskResponse(task) : null;
    };

    // Idempotency (SRS SR06): a repeated submit with the same key returns the first task.
    if (clientRequestId) {
        const existingTask = await findByRequestId();
        if (existingTask) return res.status(200).json({ status: "success", data: { task: existingTask } });
    }

    const status = parseStatus(req.body.status) ?? TaskStatus.todo;
    const due = parseDue(req.body, user.timezone);
    const labelIds = await parseLabelIds(req.body.labelIds, membership.workspaceId);
    const projectId = await parseProjectId(req.body.projectId, membership.workspaceId);
    // Anyone may set an assignee on a task they create (they're its creator).
    const assigneeMembershipId = await parseAssigneeMembershipId(req.body.assigneeMembershipId, membership.workspaceId);

    try {
        const task = await prisma.$transaction(async (tx) => {
            const createdTask = await tx.task.create({
                data: {
                    workspaceId: membership.workspaceId,
                    creatorId: membership.userId,
                    clientRequestId: clientRequestId || null,
                    projectId,
                    ...(labelIds && { labels: { create: labelIds.map((labelId) => ({ labelId })) } }),
                    assigneeMembershipId,
                    title: parseTitle(req.body.title, { required: true }) as string,
                    description: parseDescription(req.body.description),
                    status,
                    priority: parsePriority(req.body.priority),
                    ...(due ?? {}),
                    completedAt: status === TaskStatus.completed ? new Date() : null,
                },
                include: taskInclude,
            });
            await recordActivity(tx, {
                workspaceId: createdTask.workspaceId,
                actorId: membership.userId,
                entityType: "task",
                entityId: createdTask.id,
                projectId: createdTask.projectId,
                action: "task.created",
                summary: createdTask.title,
            });
            return createdTask;
        });

        logger.info(`Task created taskId=${task.id} workspaceId=${membership.workspaceId} userId=${membership.userId}`);
        res.status(201).json({ status: "success", data: { task: toTaskResponse(task) } });
    } catch (error) {
        // Two identical submits racing past the lookup above: the unique key stops the
        // second one — answer with the task the first one created.
        if (clientRequestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            const existingTask = await findByRequestId();
            if (existingTask) return res.status(200).json({ status: "success", data: { task: existingTask } });
        }
        throw error;
    }
});

// ─── Single task: /api/tasks/:id ─────────────────────

export const getTaskById = catchAsync(async (req, res) => {
    const id = assertValidTaskId(routeParam(req, "id"));
    await loadTaskForMember(id, requireUser(req).id);
    const task = await findTaskResponse(id);
    // The detail view lists subtasks themselves (each with its own assignee and status).
    const subtasks = await prisma.task.findMany({
        where: { parentTaskId: id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: taskInclude,
    });

    res.status(200).json({ status: "success", data: { task: { ...task, subtasks: subtasks.map(toTaskResponse) } } });
});

export const editTask = catchAsync(async (req, res) => {
    const id = assertValidTaskId(routeParam(req, "id"));
    const user = requireUser(req);
    const { task: existingTask, membership } = await loadTaskForMember(id, user.id);

    if (!canEditTask(membership, existingTask)) {
        throw new AppError("You can only edit tasks you created or are assigned to", 403);
    }
    await assertTaskWritable(existingTask);
    const expectedVersion = parseExpectedVersion(req.body.version);

    const assigneeMembershipId = await parseAssigneeMembershipId(req.body.assigneeMembershipId, existingTask.workspaceId);
    if (assigneeMembershipId !== undefined && assigneeMembershipId !== existingTask.assigneeMembershipId
        && !canAssignTask(membership, existingTask)) {
        throw new AppError("You can't reassign this task", 403);
    }

    const status = parseStatus(req.body.status);
    const due = parseDue(req.body, user.timezone);
    const labelIds = await parseLabelIds(req.body.labelIds, existingTask.workspaceId);
    // Moving between projects stays inside the task's workspace (PRD FR06).
    const projectId = await parseProjectId(req.body.projectId, existingTask.workspaceId);

    // A subtask always lives in its parent's project (PRD FR07) — it can't move on its own.
    if (existingTask.parentTaskId && projectId !== undefined && projectId !== existingTask.projectId) {
        throw new AppError("A subtask follows its parent's project — move the parent instead", 400);
    }
    const movesProject = !existingTask.parentTaskId && projectId !== undefined && projectId !== existingTask.projectId;

    const task = await updateWithVersionCheck(
        id,
        expectedVersion,
        user.id,
        {
            title: parseTitle(req.body.title, { required: false }),
            description: parseDescription(req.body.description),
            status,
            priority: parsePriority(req.body.priority),
            ...(due ?? {}),
            ...completionChange(existingTask.status, status),
            assigneeMembershipId,
            projectId,
        },
        async (tx) => {
            if (labelIds) await replaceLabels(tx, id, labelIds);
            // NOTE: changing the parent's project moves its subtasks with it (PRD FR07).
            if (movesProject) {
                await tx.task.updateMany({ where: { parentTaskId: id }, data: { projectId, version: { increment: 1 } } });
            }
        }
    );

    logger.info(`Task updated taskId=${id} userId=${membership.userId} version=${task?.version}`);
    res.status(200).json({ status: "success", data: { task } });
});

export const updateTaskStatus = catchAsync(async (req, res) => {
    const id = assertValidTaskId(routeParam(req, "id"));
    const { task: existingTask, membership } = await loadTaskForMember(id, requireUser(req).id);

    if (!canEditTask(membership, existingTask)) {
        throw new AppError("You can only update tasks you created or are assigned to", 403);
    }
    await assertTaskWritable(existingTask);
    if (req.body.status === undefined) throw new AppError("Please provide a valid status", 400);
    const status = parseStatus(req.body.status);
    const expectedVersion = parseExpectedVersion(req.body.version);

    const task = await updateWithVersionCheck(id, expectedVersion, membership.userId, {
        status,
        ...completionChange(existingTask.status, status),
    });
    // Completing a parent never completes its subtasks (PRD FR07); the response's
    // subtaskCounts lets the client warn about unfinished ones.

    logger.info(`Task status updated taskId=${id} userId=${membership.userId} status=${task?.status}`);
    res.status(200).json({ status: "success", data: { task } });
});

export const deleteTask = catchAsync(async (req, res) => {
    const id = assertValidTaskId(routeParam(req, "id"));
    const { task, membership } = await loadTaskForMember(id, requireUser(req).id);

    if (!canDeleteTask(membership, task)) {
        throw new AppError("You can only delete tasks you created", 403);
    }
    await assertTaskWritable(task);

    // The history entry outlives the task (no foreign key), so "who deleted it" stays answerable.
    await prisma.$transaction(async (tx) => {
        await tx.task.delete({ where: { id } });
        const entry = { workspaceId: task.workspaceId, actorId: membership.userId, projectId: task.projectId, summary: task.title } as const;
        await recordActivity(tx, { ...entry, entityType: "task", entityId: id, action: "task.deleted" });
        // A deleted subtask also shows on its parent's timeline.
        if (task.parentTaskId) {
            await recordActivity(tx, { ...entry, entityType: "task", entityId: task.parentTaskId, action: "task.deleted" });
        }
    });

    logger.info(`Task deleted taskId=${id} userId=${membership.userId}`);
    res.status(204).json({ status: "success", data: null });
});

// ─── Subtasks: POST /api/tasks/:id/subtasks ─────────────────────
// One level only (PRD FR07). Any member can add one (PRD §8: "Create tasks and subtasks");
// it inherits the parent's workspace and project and has its own assignee, status and
// due date. Its permissions are its own: the parent's assignee doesn't get to edit it.
export const createSubtask = catchAsync(async (req, res) => {
    const parentId = assertValidTaskId(routeParam(req, "id"));
    const user = requireUser(req);
    const { task: parent, membership } = await loadTaskForMember(parentId, user.id);

    if (parent.parentTaskId) throw new AppError("Subtasks can't have their own subtasks", 400);
    await assertTaskWritable(parent);

    const status = parseStatus(req.body.status) ?? TaskStatus.todo;
    const due = parseDue(req.body, user.timezone);
    const assigneeMembershipId = await parseAssigneeMembershipId(req.body.assigneeMembershipId, parent.workspaceId);
    const subtask = await prisma.$transaction(async (tx) => {
        const createdSubtask = await tx.task.create({
            data: {
                workspaceId: parent.workspaceId,
                projectId: parent.projectId,
                parentTaskId: parent.id,
                creatorId: membership.userId,
                assigneeMembershipId,
                title: parseTitle(req.body.title, { required: true }) as string,
                description: parseDescription(req.body.description),
                status,
                priority: parsePriority(req.body.priority),
                ...(due ?? {}),
                completedAt: status === TaskStatus.completed ? new Date() : null,
            },
            include: taskInclude,
        });
        const entry = { workspaceId: parent.workspaceId, actorId: membership.userId, projectId: parent.projectId, summary: createdSubtask.title } as const;
        await recordActivity(tx, { ...entry, entityType: "task", entityId: createdSubtask.id, action: "task.created" });
        // ...and on the parent's timeline, so its history shows the breakdown growing.
        await recordActivity(tx, { ...entry, entityType: "task", entityId: parent.id, action: "subtask.created" });
        return createdSubtask;
    });

    logger.info(`Subtask created taskId=${subtask.id} parentId=${parent.id} userId=${membership.userId}`);
    res.status(201).json({ status: "success", data: { task: toTaskResponse(subtask) } });
});
