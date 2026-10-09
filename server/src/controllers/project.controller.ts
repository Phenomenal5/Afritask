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
// Top-level tasks only by default (PRD FR14) — subtasks don't exist yet; revisit with them.
const withTaskCounts = async (projects: Project[]) => {
    if (projects.length === 0) return [];
    const grouped = await prisma.task.groupBy({
        by: ["projectId", "status"],
        where: { projectId: { in: projects.map((project) => project.id) } },
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

const assertManager = (membership: Membership) => {
    if (!isManager(membership)) throw new AppError("Only Owners and Admins can manage projects", 403);
};

// ─── /api/workspaces/:workspaceId/projects ─────────────────────

export const listWorkspaceProjects = catchAsync(async (req, res) => {
    const membership = requireMembership(req);
    // Archived projects are excluded by default (PRD FR14); ?includeArchived=true shows them.
    const includeArchived = req.query.includeArchived === "true";

    const projects = await prisma.project.findMany({
        where: {
            workspaceId: membership.workspaceId,
            ...(!includeArchived && { state: { not: ProjectState.archived } }),
        },
        orderBy: [{ state: "asc" }, { createdAt: "desc" }],
    });

    res.status(200).json({ status: "success", results: projects.length, data: { projects: await withTaskCounts(projects) } });
});

export const createProject = catchAsync(async (req, res) => {
    const membership = requireMembership(req);

    const project = await prisma.project.create({
        data: {
            workspaceId: membership.workspaceId,
            name: normalizeWorkspaceName(req.body.name, "Project name"),
            description: parseDescription(req.body.description),
            createdById: membership.userId,
        },
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
    const updated = await prisma.project.update({
        where: { id: project.id },
        data: {
            ...(name !== undefined && { name: normalizeWorkspaceName(name, "Project name") }),
            description: parseDescription(description),
            ...(state !== undefined && { state }),
        },
    });

    logger.info(`Project updated projectId=${project.id} by userId=${membership.userId}`);
    res.status(200).json({ status: "success", data: { project: (await withTaskCounts([updated]))[0] } });
});

export const archiveProject = catchAsync(async (req, res) => {
    const { project, membership } = await loadProjectForMember(routeParam(req, "projectId"), requireUser(req).id);
    assertManager(membership);

    // Conditional on "not archived yet" so a double click can't overwrite priorState with "archived".
    const { count } = await prisma.project.updateMany({
        where: { id: project.id, state: { not: ProjectState.archived } },
        data: { priorState: project.state, state: ProjectState.archived },
    });
    if (count === 0) throw new AppError("This project is already archived", 409);

    logger.info(`Project archived projectId=${project.id} by userId=${membership.userId}`);
    res.status(200).json({ status: "success", message: "Project archived" });
});

export const restoreProject = catchAsync(async (req, res) => {
    const { project, membership } = await loadProjectForMember(routeParam(req, "projectId"), requireUser(req).id);
    assertManager(membership);
    if (project.state !== ProjectState.archived) throw new AppError("This project isn't archived", 409);

    // Back to where it was before archiving (SRS SR05). Reminder recalculation on restore
    // lands with per-task reminders; the daily job simply resumes including these tasks.
    const restored = await prisma.project.update({
        where: { id: project.id },
        data: { state: project.priorState ?? ProjectState.active, priorState: null },
    });

    logger.info(`Project restored projectId=${project.id} to ${restored.state} by userId=${membership.userId}`);
    res.status(200).json({ status: "success", data: { project: (await withTaskCounts([restored]))[0] } });
});
