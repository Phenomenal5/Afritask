import validator from "validator";
import prisma from "../config/prisma.js";
import { Prisma, TaskPriority, TaskStatus, WorkspaceRole, type Task } from "../generated/prisma/client.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { notFoundUnlessSuspended, requireActiveMembership, requireMembership } from "../middlewares/workspaceAccess.middleware.js";
import { canAssignTask, canDeleteTask, canEditTask } from "../utils/taskPermissions.js";
import { assertSubtaskInsideTask, assertSubtasksFitDuration, assertTaskWindowHoldsSubtasks, type ScheduleWindow } from "../utils/subtaskSchedule.js";
import { parseDue } from "../utils/dueDate.js";
import { assertStartNotAfterDue, parseStart } from "../utils/startDate.js";
import routeParam from "../utils/routeParam.js";
import { DUE_VIEWS, dueViewWhere, isDueView } from "../utils/taskViews.js";
import { diffFields, recordActivity } from "../services/activityService.js";
import { notifyTaskAssigned } from "../services/notificationService.js";
import { dispatchNotificationsSoon } from "../services/realtimeService.js";
import {
    DEFAULT_REMINDER_OFFSET,
    computeSchedule,
    parseReminderOffset,
    scheduleInputsChanged,
} from "../utils/reminderSchedule.js";

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
    const membership = await requireActiveMembership(task.workspaceId, userId).catch(notFoundUnlessSuspended("Task not found"));
    // For a subtask: who is assigned its parent (they control the parent's subtasks too).
    const parentAssigneeMembershipId = task.parentTaskId
        ? (await prisma.task.findUnique({ where: { id: task.parentTaskId }, select: { assigneeMembershipId: true } }))?.assigneeMembershipId ?? null
        : null;
    return { task, membership, parentAssigneeMembershipId };
};

// ─── Subtasks fit inside their task (utils/subtaskSchedule.ts) ─────────────────────
// Checked whenever a start or due time changes, in both directions: a subtask moving
// inside its task, and a task's own window changing around its subtasks.
const assertScheduleFits = async (task: { id: string; parentTaskId: string | null }, nextWindow: ScheduleWindow) => {
    if (task.parentTaskId) {
        const parent = await prisma.task.findUnique({ where: { id: task.parentTaskId }, select: { startAt: true, dueAt: true } });
        if (!parent) return;
        assertSubtaskInsideTask(parent, nextWindow);
        const siblings = await prisma.task.findMany({ where: { parentTaskId: task.parentTaskId, id: { not: task.id } }, select: { startAt: true, dueAt: true } });
        assertSubtasksFitDuration(parent, [...siblings, nextWindow]);
        return;
    }
    const subtasks = await prisma.task.findMany({ where: { parentTaskId: task.id }, select: { startAt: true, dueAt: true, title: true } });
    if (subtasks.length) assertTaskWindowHoldsSubtasks(nextWindow, subtasks);
};

// Returned with every task: its project (to show it and know it's read-only), the
// assignee's public identity, its labels, its parent (for subtasks) and subtask progress.
const assigneeSelect = { select: { id: true, user: { select: { id: true, name: true, photo: true } } } } as const;
const taskInclude = {
    project: { select: { id: true, name: true, state: true } },
    assignee: assigneeSelect,
    labels: { select: { label: { select: { id: true, name: true, color: true } } }, orderBy: { label: { name: "asc" } } },
    parent: { select: { id: true, title: true, startAt: true, dueAt: true, assigneeMembershipId: true } },
    subtasks: { select: { status: true } },
    // Live comments only, for the comment button on list rows and board cards.
    _count: { select: { comments: { where: { deletedAt: null } } } },
} as const satisfies Prisma.TaskInclude;

// The include's relations, whatever scalar fields the query returned (the global omit
// removes some, which Prisma.TaskGetPayload doesn't model — hence a structural type).
interface TaskRelations {
    labels: { label: { id: string; name: string; color: string } }[];
    subtasks: { status: TaskStatus }[];
    _count: { comments: number };
}

// API shape: labels flattened, subtask list replaced by counts (the detail route adds the list).
const toTaskResponse = <TaskRow extends TaskRelations>(task: TaskRow) => {
    const { labels, subtasks, _count, ...fields } = task;
    return {
        ...fields,
        labels: labels.map((taskLabel) => taskLabel.label),
        commentCount: _count.comments,
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
    completionNote: string | null;
    priority: TaskPriority;
    dueAt: Date | null;
    startAt: Date | null;
    project: { name: string } | null;
    assignee: { user: { name: string } } | null;
}
const HISTORY_FIELDS = ["title", "description", "status", "completionNote", "priority", "dueAt", "startAt", "project", "assignee", "labels"] as const;
const toHistorySnapshot = (task: TaskHistoryRow) => ({
    title: task.title,
    description: task.description,
    status: task.status,
    completionNote: task.completionNote,
    priority: task.priority,
    dueAt: task.dueAt,
    startAt: task.startAt,
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
    // Same cap as mentions: no task needs more, and it bounds the lookup below.
    if (labelIds.length > 50) throw new AppError("A task can have at most 50 labels", 400);
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
// ─── Completion note ─────────────────────
const COMPLETION_NOTE_MAX_LENGTH = 2000;
export const COMPLETION_NOTE_REQUIRED = "Add a short note on what was done before marking this task completed.";

// The "what was done" note sent with a completion. Required for top-level tasks; subtasks
// (checklist items) may leave it empty.
const parseCompletionNote = (rawNote: unknown, isSubtask: boolean): string | null => {
    if (rawNote !== undefined && rawNote !== null && typeof rawNote !== "string") throw new AppError("completionNote must be text", 400);
    const note = (rawNote ?? "").trim();
    if (!note && !isSubtask) throw new AppError(COMPLETION_NOTE_REQUIRED, 400, "completion_note_required");
    if (note.length > COMPLETION_NOTE_MAX_LENGTH) throw new AppError(`Keep the completion note under ${COMPLETION_NOTE_MAX_LENGTH} characters`, 400);
    return note || null;
};

// ─── Reason for a timing change ─────────────────────
const EXTENSION_REASON_MAX_LENGTH = 500;

// The "why" sent with a start or due change (`dueChangeReason`). Optional while the task is
// still To do; required from Members and Admins once work has started (see editTask).
const parseExtensionReason = (rawReason: unknown): string | null => {
    if (rawReason === undefined || rawReason === null) return null;
    if (typeof rawReason !== "string") throw new AppError("dueChangeReason must be text", 400);
    const reason = rawReason.trim();
    if (reason.length > EXTENSION_REASON_MAX_LENGTH) throw new AppError(`Keep the reason under ${EXTENSION_REASON_MAX_LENGTH} characters`, 400);
    return reason || null;
};

// What a status change does to completedAt and the completion note. Reopening clears both
// (the history entry keeps the old note).
const completionChange = (previousStatus: TaskStatus, nextStatus: TaskStatus | undefined, rawNote: unknown, isSubtask: boolean) => {
    if (!nextStatus || nextStatus === previousStatus) return {};
    if (nextStatus === TaskStatus.completed) return { completedAt: new Date(), completionNote: parseCompletionNote(rawNote, isSubtask) };
    if (previousStatus === TaskStatus.completed) return { completedAt: null, completionNote: null };
    return {};
};

// Reminder choice + first schedule for a new task or subtask. No explicit choice and a
// deadline → the default reminder. (New tasks can't be in archived projects.)
const reminderFieldsForNewTask = (
    rawOffset: unknown,
    due: ReturnType<typeof parseDue>,
    start: ReturnType<typeof parseStart>,
    status: TaskStatus
) => {
    const parsedOffset = parseReminderOffset(rawOffset);
    const reminderOffset = parsedOffset !== undefined ? parsedOffset : due?.dueAt ? DEFAULT_REMINDER_OFFSET : null;
    assertStartNotAfterDue(start?.startAt, due?.dueAt);
    const schedule = computeSchedule(
        {
            dueAt: due?.dueAt ?? null,
            dueKind: due?.dueKind ?? null,
            dueTimezone: due?.dueTimezone ?? null,
            reminderOffset,
            status,
            startAt: start?.startAt ?? null,
            startKind: start?.startKind ?? null,
            startTimezone: start?.startTimezone ?? null,
        },
        null
    );
    return { reminderOffset, ...(start ?? {}), ...schedule };
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
    alsoInTransaction?: (transaction: Prisma.TransactionClient) => Promise<unknown>,
    // Extra lines for the history entry that aren't task fields (e.g. why a date moved).
    historyExtras: Record<string, { from: unknown; to: unknown }> = {}
) => {
    await prisma.$transaction(async (transaction) => {
        const before = await transaction.task.findUnique({ where: { id: taskId }, include: taskInclude });
        const { count } = await transaction.task.updateMany({
            where: { id: taskId, version: expectedVersion },
            data: { ...data, version: { increment: 1 } },
        });
        if (count === 0 || !before) {
            throw new AppError("This task was changed by someone else. Refresh to see the latest version and try again.", 409);
        }
        if (alsoInTransaction) await alsoInTransaction(transaction);

        const after = await transaction.task.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
        await notifyTaskAssigned(transaction, after, before.assigneeMembershipId, actorId);

        // NOTE: only when the deadline, reminder choice, completion or archive state changed —
        // re-planning on a title edit would re-arm a reminder that already fired.
        const projectStateOf = (row: typeof after) => row.project?.state ?? null;
        if (scheduleInputsChanged({ ...before, projectState: projectStateOf(before) }, { ...after, projectState: projectStateOf(after) })) {
            await transaction.task.update({ where: { id: taskId }, data: computeSchedule(after, projectStateOf(after)) });
        }
        const fieldChanges = diffFields(toHistorySnapshot(before), toHistorySnapshot(after), [...HISTORY_FIELDS]);
        const changes = Object.keys(fieldChanges).length > 0 ? { ...fieldChanges, ...historyExtras } : fieldChanges;
        if (Object.keys(changes).length > 0) {
            await recordActivity(transaction, {
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
    // An assignment change may have created a notification — send it live now.
    dispatchNotificationsSoon();
    return findTaskResponse(taskId);
};

const replaceLabels = (transaction: Prisma.TransactionClient, taskId: string, labelIds: string[]) =>
    transaction.taskLabel.deleteMany({ where: { taskId } }).then(() =>
        labelIds.length > 0 ? transaction.taskLabel.createMany({ data: labelIds.map((labelId) => ({ taskId, labelId })) }) : null
    );

// ─── Workspace collection: /api/workspaces/:workspaceId/tasks ─────────────────────

// ─── List query parsing (SRS SR13) ─────────────────────
// Filters accept several values, comma-separated or repeated (?status=todo,in_review or
// ?status=todo&status=in_review): OR within one filter, AND across filters.
const SEARCH_MAX_LENGTH = 200;
const DEFAULT_PAGE_LIMIT = 50;
const MAX_PAGE_LIMIT = 100;

// NOTE: only plain strings count. Operator-shaped params (?status[$ne]=x parse to objects)
// are dropped, so they can never reach the query as anything but "no filter".
const queryValues = (value: unknown): string[] =>
    (Array.isArray(value) ? value : value === undefined ? [] : [value])
        .filter((entry): entry is string => typeof entry === "string")
        .flatMap((entry) => entry.split(","))
        .map((entry) => entry.trim())
        .filter(Boolean);

// One filter type → one OR group. Unknown ids are rejected rather than silently ignored,
// so a typo never looks like "no results".
const uuidValues = (values: string[], name: string) => {
    if (!values.every((value) => validator.isUUID(value))) throw new AppError(`${name} must be ids`, 400);
    return values;
};

// ?page=&limit=: offset paging over a STABLE order (the sort, then id), so walking the pages
// of unchanged data never repeats or skips a task (SRS SR13 acceptance). No limit = all.
const MAX_PAGE = 10_000;
const parsePaging = (pageParam: unknown, limitParam: unknown) => {
    if (limitParam === undefined) return null;
    const limit = Number(limitParam);
    const page = pageParam === undefined ? 1 : Number(pageParam);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) throw new AppError(`limit must be between 1 and ${MAX_PAGE_LIMIT}`, 400);
    // NOTE: capped so (page - 1) * limit stays a valid database offset (a 500 otherwise).
    if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) throw new AppError(`page must be between 1 and ${MAX_PAGE}`, 400);
    return { page, limit };
};

export const listWorkspaceTasks = catchAsync(async (req, res) => {
    const membership = requireMembership(req);
    const user = requireUser(req);
    const { sort, includeSubtasks, due, counts } = req.query;
    if (due !== undefined && !isDueView(due)) {
        throw new AppError(`due must be one of ${DUE_VIEWS.join(", ")}`, 400);
    }
    const paging = parsePaging(req.query.page, req.query.limit ?? (req.query.page !== undefined ? DEFAULT_PAGE_LIMIT : undefined));
    const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, SEARCH_MAX_LENGTH) : "";

    // Every active member sees every task in the workspace (PRD §8: all projects are
    // shared in V1). The workspaceId condition is the isolation boundary — every other
    // condition is AND-ed onto it, so no filter can widen the search beyond it.
    const conditions: Prisma.TaskWhereInput[] = [{ workspaceId: membership.workspaceId }];

    const projectValues = queryValues(req.query.projectId);
    if (projectValues.length > 0) {
        // Asking for projects by id still shows archived ones, read-only.
        const projectIds = uuidValues(projectValues.filter((value) => value !== "none"), "projectId");
        conditions.push({
            OR: [
                ...(projectValues.includes("none") ? [{ projectId: null }] : []),
                ...(projectIds.length ? [{ projectId: { in: projectIds } }] : []),
            ],
        });
    } else {
        // Workspace-wide lists leave out archived projects' tasks (PRD FR14).
        conditions.push({ OR: [{ projectId: null }, { project: { state: { not: "archived" } } }] });
    }

    const statuses = queryValues(req.query.status).map((value) => parseStatus(value) as TaskStatus);
    if (statuses.length) conditions.push({ status: { in: statuses } });

    const priorities = queryValues(req.query.priority).map((value) => parsePriority(value) as TaskPriority);
    if (priorities.length) conditions.push({ priority: { in: priorities } });

    const assigneeValues = queryValues(req.query.assignee);
    if (assigneeValues.length) {
        const membershipIds = uuidValues(
            assigneeValues.filter((value) => value !== "me" && value !== "none"),
            "assignee"
        );
        if (assigneeValues.includes("me")) membershipIds.push(membership.id);
        conditions.push({
            OR: [
                ...(assigneeValues.includes("none") ? [{ assigneeMembershipId: null }] : []),
                ...(membershipIds.length ? [{ assigneeMembershipId: { in: membershipIds } }] : []),
            ],
        });
    }

    const labelIds = uuidValues(queryValues(req.query.labelId), "labelId");
    if (labelIds.length) conditions.push({ labels: { some: { labelId: { in: labelIds } } } });

    if (search) {
        conditions.push({
            OR: [
                { title: { contains: search, mode: "insensitive" } },
                { description: { contains: search, mode: "insensitive" } },
                { project: { name: { contains: search, mode: "insensitive" } } },
            ],
        });
    }

    // Lists and boards show TOP-LEVEL tasks; subtasks live inside their parent (PRD FR12).
    // Asking "what's assigned to someone" includes separately assigned subtasks (PRD FR11),
    // and so does a search — a matching subtask shouldn't be invisible. Both carry `parent`.
    const wantsSubtasks = includeSubtasks === "true" || assigneeValues.some((value) => value !== "none") || !!search;
    if (!wantsSubtasks) conditions.push({ parentTaskId: null });

    // Due views (SRS SR11) are judged in the viewer's profile timezone, at request time.
    const now = new Date();
    const timeZone = user.timezone || "UTC";
    const where: Prisma.TaskWhereInput = { AND: isDueView(due) ? [...conditions, dueViewWhere(due, now, timeZone)] : conditions };

    const [tasks, total] = await Promise.all([
        prisma.task.findMany({
            where,
            orderBy: parseSort(sort),
            include: taskInclude,
            ...(paging && { skip: (paging.page - 1) * paging.limit, take: paging.limit }),
        }),
        paging ? prisma.task.count({ where }) : Promise.resolve(null),
    ]);

    // ?counts=true: how many tasks each due view holds under the SAME other filters, so a
    // count and the list it links to can never disagree (SRS SR14 acceptance).
    const viewCounts = counts === "true"
        ? Object.fromEntries(
            await Promise.all(DUE_VIEWS.map(async (view) => [view, await prisma.task.count({ where: { AND: [...conditions, dueViewWhere(view, now, timeZone)] } })] as const))
        )
        : undefined;

    logger.info(`List tasks workspaceId=${membership.workspaceId} userId=${membership.userId} returned ${tasks.length}`);
    res.status(200).json({
        status: "success",
        results: tasks.length,
        data: {
            tasks: tasks.map(toTaskResponse),
            ...(viewCounts && { counts: viewCounts }),
            ...(paging && total !== null && {
                pagination: { page: paging.page, limit: paging.limit, total, totalPages: Math.max(1, Math.ceil(total / paging.limit)) },
            }),
        },
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
    const reminder = reminderFieldsForNewTask(req.body.reminderOffset, due, parseStart(req.body, user.timezone), status);
    const labelIds = await parseLabelIds(req.body.labelIds, membership.workspaceId);
    const projectId = await parseProjectId(req.body.projectId, membership.workspaceId);
    // Anyone may set an assignee on a task they create (they're its creator).
    const assigneeMembershipId = await parseAssigneeMembershipId(req.body.assigneeMembershipId, membership.workspaceId);

    try {
        const task = await prisma.$transaction(async (transaction) => {
            const createdTask = await transaction.task.create({
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
                    originalDueAt: due?.dueAt ?? null,
                    ...reminder,
                    completedAt: status === TaskStatus.completed ? new Date() : null,
                    // Created already done: it needs its note like any other completion.
                    completionNote: status === TaskStatus.completed ? parseCompletionNote(req.body.completionNote, false) : null,
                },
                include: taskInclude,
            });
            await recordActivity(transaction, {
                workspaceId: createdTask.workspaceId,
                actorId: membership.userId,
                entityType: "task",
                entityId: createdTask.id,
                projectId: createdTask.projectId,
                action: "task.created",
                summary: createdTask.title,
            });
            await notifyTaskAssigned(transaction, createdTask, null, membership.userId);
            return createdTask;
        });

        logger.info(`Task created taskId=${task.id} workspaceId=${membership.workspaceId} userId=${membership.userId}`);
        dispatchNotificationsSoon();
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
    const { task: existingTask, membership, parentAssigneeMembershipId } = await loadTaskForMember(id, user.id);

    if (!canEditTask(membership, existingTask, parentAssigneeMembershipId)) {
        throw new AppError("You can only edit tasks you created or are assigned to", 403);
    }
    await assertTaskWritable(existingTask);
    const expectedVersion = parseExpectedVersion(req.body.version);

    const assigneeMembershipId = await parseAssigneeMembershipId(req.body.assigneeMembershipId, existingTask.workspaceId);
    if (assigneeMembershipId !== undefined && assigneeMembershipId !== existingTask.assigneeMembershipId
        && !canAssignTask(membership, existingTask, parentAssigneeMembershipId)) {
        throw new AppError("You can't reassign this task", 403);
    }

    const status = parseStatus(req.body.status);
    const due = parseDue(req.body, user.timezone);
    const start = parseStart(req.body, user.timezone);
    // Compare what the task WILL have after this edit, changed or not.
    const nextWindow = { startAt: start !== undefined ? start.startAt : existingTask.startAt, dueAt: due !== undefined ? due.dueAt : existingTask.dueAt };
    assertStartNotAfterDue(nextWindow.startAt, nextWindow.dueAt);
    if (start !== undefined || due !== undefined) await assertScheduleFits(existingTask, nextWindow);
    let reminderOffset = parseReminderOffset(req.body.reminderOffset);
    // A deadline added to a task that never had one gets the default reminder, like a new task.
    if (reminderOffset === undefined && due?.dueAt && !existingTask.dueAt && !existingTask.reminderOffset) {
        reminderOffset = DEFAULT_REMINDER_OFFSET;
    }
    const labelIds = await parseLabelIds(req.body.labelIds, existingTask.workspaceId);
    // Moving between projects stays inside the task's workspace (PRD FR06).
    const projectId = await parseProjectId(req.body.projectId, existingTask.workspaceId);

    // A subtask always lives in its parent's project (PRD FR07) — it can't move on its own.
    if (existingTask.parentTaskId && projectId !== undefined && projectId !== existingTask.projectId) {
        throw new AppError("A subtask stays in its parent's project. Move the parent instead", 400);
    }
    const movesProject = !existingTask.parentTaskId && projectId !== undefined && projectId !== existingTask.projectId;

    // NOTE: once a task has left To do, moving its start or due time needs a reason from a
    // Member or Admin, so the people relying on the plan know why it changed. The Owner is
    // exempt. Sending the same time again isn't a change.
    const sameInstant = (first: Date | null, second: Date | null) => (first?.getTime() ?? null) === (second?.getTime() ?? null);
    const timingChanges = (start !== undefined && !sameInstant(start.startAt, existingTask.startAt))
        || (due !== undefined && !sameInstant(due.dueAt, existingTask.dueAt));
    const timingReason = timingChanges ? parseExtensionReason(req.body.dueChangeReason) : null;
    if (timingChanges && !timingReason && existingTask.status !== TaskStatus.todo && membership.role !== WorkspaceRole.owner) {
        throw new AppError("Work on this task has started, so say why its timing is changing.", 400, "timing_reason_required");
    }

    // An extension = an existing due date moved LATER (not added, cleared or brought forward).
    const extension = due?.dueAt && existingTask.dueAt && due.dueAt.getTime() > existingTask.dueAt.getTime()
        ? { fromDueAt: existingTask.dueAt, toDueAt: due.dueAt, reason: timingReason }
        : null;

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
            // The first due date a task gets is its original deadline (kept through extensions).
            ...(due?.dueAt && !existingTask.originalDueAt && { originalDueAt: due.dueAt }),
            ...(extension && { dueExtensionCount: { increment: 1 } }),
            ...(start ?? {}),
            reminderOffset,
            ...completionChange(existingTask.status, status, req.body.completionNote, !!existingTask.parentTaskId),
            // Correcting the note of a task that stays completed.
            ...(existingTask.status === TaskStatus.completed && (status ?? existingTask.status) === TaskStatus.completed && req.body.completionNote !== undefined
                ? { completionNote: parseCompletionNote(req.body.completionNote, !!existingTask.parentTaskId) }
                : {}),
            assigneeMembershipId,
            projectId,
        },
        async (transaction) => {
            if (labelIds) await replaceLabels(transaction, id, labelIds);
            // NOTE: changing the parent's project moves its subtasks with it (PRD FR07).
            if (movesProject) {
                await transaction.task.updateMany({ where: { parentTaskId: id }, data: { projectId, version: { increment: 1 } } });
            }
            // Log the extension against whoever the task belongs to now (assignee, else creator).
            if (extension) {
                const owner = await transaction.task.findUniqueOrThrow({ where: { id }, select: { creatorId: true, assignee: { select: { userId: true } } } });
                await transaction.dueDateExtension.create({
                    data: {
                        taskId: id,
                        workspaceId: existingTask.workspaceId,
                        extendedById: membership.userId,
                        responsibleUserId: owner.assignee?.userId ?? owner.creatorId,
                        ...extension,
                    },
                });
            }
        },
        // The reason shows next to the timing change in the task's history.
        timingReason ? { dueChangeReason: { from: null, to: timingReason } } : {}
    );

    logger.info(`Task updated taskId=${id} userId=${membership.userId} version=${task?.version}`);
    res.status(200).json({ status: "success", data: { task } });
});

export const updateTaskStatus = catchAsync(async (req, res) => {
    const id = assertValidTaskId(routeParam(req, "id"));
    const { task: existingTask, membership, parentAssigneeMembershipId } = await loadTaskForMember(id, requireUser(req).id);

    if (!canEditTask(membership, existingTask, parentAssigneeMembershipId)) {
        throw new AppError("You can only update tasks you created or are assigned to", 403);
    }
    await assertTaskWritable(existingTask);
    if (req.body.status === undefined) throw new AppError("Please provide a valid status", 400);
    const status = parseStatus(req.body.status);
    const expectedVersion = parseExpectedVersion(req.body.version);

    const task = await updateWithVersionCheck(id, expectedVersion, membership.userId, {
        status,
        ...completionChange(existingTask.status, status, req.body.completionNote, !!existingTask.parentTaskId),
    });
    // Completing a parent never completes its subtasks (PRD FR07); the response's
    // subtaskCounts lets the client warn about unfinished ones.

    logger.info(`Task status updated taskId=${id} userId=${membership.userId} status=${task?.status}`);
    res.status(200).json({ status: "success", data: { task } });
});

export const deleteTask = catchAsync(async (req, res) => {
    const id = assertValidTaskId(routeParam(req, "id"));
    const { task, membership, parentAssigneeMembershipId } = await loadTaskForMember(id, requireUser(req).id);

    if (!canDeleteTask(membership, task, parentAssigneeMembershipId)) {
        throw new AppError("You can only delete tasks you created", 403);
    }
    await assertTaskWritable(task);

    // The history entry outlives the task (no foreign key), so "who deleted it" stays answerable.
    await prisma.$transaction(async (transaction) => {
        await transaction.task.delete({ where: { id } });
        const entry = { workspaceId: task.workspaceId, actorId: membership.userId, projectId: task.projectId, summary: task.title } as const;
        await recordActivity(transaction, { ...entry, entityType: "task", entityId: id, action: "task.deleted" });
        // A deleted subtask also shows on its parent's timeline.
        if (task.parentTaskId) {
            await recordActivity(transaction, { ...entry, entityType: "task", entityId: task.parentTaskId, action: "task.deleted" });
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
    const start = parseStart(req.body, user.timezone);
    const window = { startAt: start?.startAt ?? null, dueAt: due?.dueAt ?? null };
    assertStartNotAfterDue(window.startAt, window.dueAt);
    assertSubtaskInsideTask(parent, window);
    const siblings = await prisma.task.findMany({ where: { parentTaskId: parent.id }, select: { startAt: true, dueAt: true } });
    assertSubtasksFitDuration(parent, [...siblings, window]);
    const reminder = reminderFieldsForNewTask(req.body.reminderOffset, due, start, status);
    const assigneeMembershipId = await parseAssigneeMembershipId(req.body.assigneeMembershipId, parent.workspaceId);
    const subtask = await prisma.$transaction(async (transaction) => {
        const createdSubtask = await transaction.task.create({
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
                // NOTE: the start date used to be parsed here only for the reminder and never
                // saved, so a subtask's start silently disappeared.
                ...(start ?? {}),
                originalDueAt: due?.dueAt ?? null,
                ...reminder,
                completedAt: status === TaskStatus.completed ? new Date() : null,
                completionNote: status === TaskStatus.completed ? parseCompletionNote(req.body.completionNote, true) : null,
            },
            include: taskInclude,
        });
        const entry = { workspaceId: parent.workspaceId, actorId: membership.userId, projectId: parent.projectId, summary: createdSubtask.title } as const;
        await recordActivity(transaction, { ...entry, entityType: "task", entityId: createdSubtask.id, action: "task.created" });
        // ...and on the parent's timeline, so its history shows the breakdown growing.
        await recordActivity(transaction, { ...entry, entityType: "task", entityId: parent.id, action: "subtask.created" });
        await notifyTaskAssigned(transaction, createdSubtask, null, membership.userId);
        return createdSubtask;
    });

    logger.info(`Subtask created taskId=${subtask.id} parentId=${parent.id} userId=${membership.userId}`);
    dispatchNotificationsSoon();
    res.status(201).json({ status: "success", data: { task: toTaskResponse(subtask) } });
});
