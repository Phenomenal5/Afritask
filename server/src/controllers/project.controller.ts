import validator from "validator";
import prisma from "../config/prisma.js";
import { ProjectState, type Membership, type Project } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger from "../utils/logger.js";
import routeParam from "../utils/routeParam.js";
import { normalizeWorkspaceName } from "../utils/workspaceValidation.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { requireActiveMembership, requireMembership } from "../middlewares/workspaceAccess.middleware.js";
import { diffFields, recordActivity, type ActivityAction, type ActivityChanges } from "../services/activityService.js";
import { computeSchedule } from "../utils/reminderSchedule.js";

// ─── Projects (SRS SR05, PRD FR05) ─────────────────────
// Every active member can view; Owner/Admin create, edit, archive and restore.
// Archived projects stay readable but are read-only (their tasks too) until restored.

const DESCRIPTION_MAX_LENGTH = 20_000;

// States a manager can set directly. Archiving/restoring have their own endpoints so
// priorState is always recorded and restored correctly.
const DIRECTLY_SETTABLE_STATES: ProjectState[] = [ProjectState.active, ProjectState.on_hold, ProjectState.completed];

const isManager = (membership: Membership) => membership.role === "owner" || membership.role === "admin";

const parseDescription = (description: unknown): string | undefined => {
    if (description === undefined) return undefined;
    if (description === null) return "";
    if (typeof description !== "string") throw new AppError("Description must be text", 400);
    if (description.length > DESCRIPTION_MAX_LENGTH) throw new AppError("Description is too long", 400);
    return description;
};

// Task counts that drive the "completing leaves N open tasks" warning and the project list.
// Top-level tasks only (PRD FR14): subtasks show progress inside their parent instead.
const withTaskCounts = async (projects: Project[]) => {
    if (projects.length === 0) return [];
    const grouped = await prisma.task.groupBy({
        by: ["projectId", "status"],
        where: { projectId: { in: projects.map((project) => project.id) }, parentTaskId: null },
        _count: { _all: true },
    });
    return projects.map((project) => {
        const projectRows = grouped.filter((row) => row.projectId === project.id);
        const totalTasks = projectRows.reduce((sum, row) => sum + row._count._all, 0);
        const completedTasks = projectRows.filter((row) => row.status === "completed").reduce((sum, row) => sum + row._count._all, 0);
        return { ...project, taskCounts: { total: totalTasks, completed: completedTasks, open: totalTasks - completedTasks } };
    });
};

// Item routes carry no workspace id: derive access from the project, 404 for outsiders.
const loadProjectForMember = async (projectId: string | undefined, userId: string) => {
    if (!projectId || !validator.isUUID(projectId)) throw new AppError("Project not found", 404);
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new AppError("Project not found", 404);
    const membership = await requireActiveMembership(project.workspaceId, userId).catch(() => {
        throw new AppError("Project not found", 404);
    });
    return { project, membership };
};

// A project event, filed under the project so its feed shows it.
const projectActivity = (project: Project, actorId: string, action: ActivityAction, changes?: ActivityChanges) => ({
    workspaceId: project.workspaceId,
    actorId,
    entityType: "project" as const,
    entityId: project.id,
    projectId: project.id,
    action,
    changes,
    summary: project.name,
});

const assertManager = (membership: Membership) => {
    if (!isManager(membership)) throw new AppError("Only Owners and Admins can manage projects", 403);
};

// ─── /api/workspaces/:workspaceId/projects ─────────────────────

export const listWorkspaceProjects = catchAsync(async (req, res) => {
    const membership = requireMembership(req);
    // Archived projects are excluded by default (PRD FR14); ?includeArchived=true shows them.
    const includeArchived = req.query.includeArchived === "true";
    // ?q= matches project names (SRS SR13), case-insensitively.
    const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 200) : "";

    const projects = await prisma.project.findMany({
        where: {
            workspaceId: membership.workspaceId,
            ...(!includeArchived && { state: { not: ProjectState.archived } }),
            ...(search && { name: { contains: search, mode: "insensitive" as const } }),
        },
        orderBy: [{ state: "asc" }, { createdAt: "desc" }],
    });

    res.status(200).json({ status: "success", results: projects.length, data: { projects: await withTaskCounts(projects) } });
});

export const createProject = catchAsync(async (req, res) => {
    const membership = requireMembership(req);

    const name = normalizeWorkspaceName(req.body.name, "Project name");
    const description = parseDescription(req.body.description);
    const project = await prisma.$transaction(async (tx) => {
        const createdProject = await tx.project.create({
            data: { workspaceId: membership.workspaceId, name, description, createdById: membership.userId },
        });
        await recordActivity(tx, projectActivity(createdProject, membership.userId, "project.created"));
        return createdProject;
    });

    logger.info(`Project created projectId=${project.id} workspaceId=${membership.workspaceId} by userId=${membership.userId}`);
    res.status(201).json({ status: "success", data: { project: (await withTaskCounts([project]))[0] } });
});

// ─── /api/projects/:projectId ─────────────────────

export const getProject = catchAsync(async (req, res) => {
    const { project, membership } = await loadProjectForMember(routeParam(req, "projectId"), requireUser(req).id);
    res.status(200).json({
        status: "success",
        data: { project: { ...(await withTaskCounts([project]))[0], canManage: isManager(membership) } },
    });
});

export const updateProject = catchAsync(async (req, res) => {
    const { project, membership } = await loadProjectForMember(routeParam(req, "projectId"), requireUser(req).id);
    assertManager(membership);
    if (project.state === ProjectState.archived) throw new AppError("This project is archived. Restore it to make changes.", 409);

    const { name, description, state } = req.body;
    if (state !== undefined && !DIRECTLY_SETTABLE_STATES.includes(state)) {
        throw new AppError("State must be active, on_hold or completed (use archive/restore for archiving)", 400);
    }

    // NOTE: completing a project never completes its tasks (PRD FR05). The client warns
    // beforehand using taskCounts.open; the server just records the new state.
    const data = {
        ...(name !== undefined && { name: normalizeWorkspaceName(name, "Project name") }),
        description: parseDescription(description),
        ...(state !== undefined && { state: state as ProjectState }),
    };
    const updated = await prisma.$transaction(async (tx) => {
        const updatedProject = await tx.project.update({ where: { id: project.id }, data });
        const changes = diffFields(project, updatedProject, ["name", "description", "state"]);
        if (Object.keys(changes).length > 0) {
            await recordActivity(tx, projectActivity(updatedProject, membership.userId, "project.updated", changes));
        }
        return updatedProject;
    });

    logger.info(`Project updated projectId=${project.id} by userId=${membership.userId}`);
    res.status(200).json({ status: "success", data: { project: (await withTaskCounts([updated]))[0] } });
});

export const archiveProject = catchAsync(async (req, res) => {
    const { project, membership } = await loadProjectForMember(routeParam(req, "projectId"), requireUser(req).id);
    assertManager(membership);

    // Conditional on "not archived yet" so a double click can't overwrite priorState with "archived".
    await prisma.$transaction(async (tx) => {
        const { count } = await tx.project.updateMany({
            where: { id: project.id, state: { not: ProjectState.archived } },
            data: { priorState: project.state, state: ProjectState.archived },
        });
        if (count === 0) throw new AppError("This project is already archived", 409);
        // Reminders and overdue alerts pause while archived (PRD FR05).
        await tx.task.updateMany({ where: { projectId: project.id }, data: { remindAt: null, overdueCheckAt: null } });
        await recordActivity(tx, projectActivity(project, membership.userId, "project.archived", {
            state: { from: project.state, to: ProjectState.archived },
        }));
    });

    logger.info(`Project archived projectId=${project.id} by userId=${membership.userId}`);
    res.status(200).json({ status: "success", message: "Project archived" });
});

export const restoreProject = catchAsync(async (req, res) => {
    const { project, membership } = await loadProjectForMember(routeParam(req, "projectId"), requireUser(req).id);
    assertManager(membership);
    if (project.state !== ProjectState.archived) throw new AppError("This project isn't archived", 409);

    // Back to where it was before archiving (SRS SR05). Reminder recalculation on restore
    // lands with per-task reminders; the daily job simply resumes including these tasks.
    const restored = await prisma.$transaction(async (tx) => {
        const restoredProject = await tx.project.update({
            where: { id: project.id },
            data: { state: project.priorState ?? ProjectState.active, priorState: null },
        });
        // Re-plan the paused schedules — future times only, so restoring never sends a
        // burst of reminders that came due while the project was archived (SRS SR17).
        const openTasks = await tx.task.findMany({
            where: { projectId: project.id, status: { not: "completed" }, dueAt: { not: null } },
            select: { id: true, dueAt: true, dueKind: true, dueTimezone: true, reminderOffset: true, status: true },
        });
        for (const openTask of openTasks) {
            await tx.task.update({ where: { id: openTask.id }, data: computeSchedule(openTask, restoredProject.state) });
        }
        await recordActivity(tx, projectActivity(restoredProject, membership.userId, "project.restored", {
            state: { from: ProjectState.archived, to: restoredProject.state },
        }));
        return restoredProject;
    });

    logger.info(`Project restored projectId=${project.id} to ${restored.state} by userId=${membership.userId}`);
    res.status(200).json({ status: "success", data: { project: (await withTaskCounts([restored]))[0] } });
});
