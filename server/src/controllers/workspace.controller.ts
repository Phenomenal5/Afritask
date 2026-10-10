import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger from "../utils/logger.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { requireMembership } from "../middlewares/workspaceAccess.middleware.js";
import { normalizeWorkspaceName } from "../utils/workspaceValidation.js";
import { recordActivity } from "../services/activityService.js";

// Public member fields — never the user's email to people outside the workspace,
// and never anything beyond what a teammate needs to recognise them.
const memberSelect = {
    id: true,
    role: true,
    joinedAt: true,
    user: { select: { id: true, name: true, email: true, photo: true } },
} as const;

// ─── List the workspaces I belong to (for the switcher) ─────────────────────
export const listMyWorkspaces = catchAsync(async (req, res) => {
    const userId = requireUser(req).id;

    const memberships = await prisma.membership.findMany({
        where: { userId, status: "active" },
        orderBy: { joinedAt: "asc" },
        select: {
            role: true,
            workspace: {
                select: {
                    id: true,
                    name: true,
                    _count: { select: { memberships: { where: { status: "active" } } } },
                },
            },
        },
    });

    const workspaces = memberships.map(({ role, workspace }) => ({
        id: workspace.id,
        name: workspace.name,
        role,
        memberCount: workspace._count.memberships,
    }));

    res.status(200).json({ status: "success", results: workspaces.length, data: { workspaces } });
});

// ─── Create a workspace (creator becomes Owner, atomically) ─────────────────────
export const createWorkspace = catchAsync(async (req, res) => {
    const user = requireUser(req);
    const name = normalizeWorkspaceName(req.body.name);

    // Nested create = one transaction: there is never a workspace without its Owner,
    // nor an Owner membership pointing at a half-created workspace (SRS SR02).
    const workspace = await prisma.$transaction(async (tx) => {
        const createdWorkspace = await tx.workspace.create({
            data: {
                name,
                memberships: { create: { userId: user.id, role: "owner" } },
            },
            select: { id: true, name: true, createdAt: true },
        });
        await recordActivity(tx, {
            workspaceId: createdWorkspace.id,
            actorId: user.id,
            entityType: "workspace",
            entityId: createdWorkspace.id,
            action: "workspace.created",
            summary: createdWorkspace.name,
        });
        return createdWorkspace;
    });

    logger.info(`Workspace created workspaceId=${workspace.id} by userId=${user.id}`);
    res.status(201).json({
        status: "success",
        data: { workspace: { ...workspace, role: "owner", memberCount: 1 } },
    });
});

// ─── Workspace details + current members ─────────────────────
export const getWorkspace = catchAsync(async (req, res) => {
    const membership = requireMembership(req);

    const workspace = await prisma.workspace.findUnique({
        where: { id: membership.workspaceId },
        select: {
            id: true,
            name: true,
            createdAt: true,
            memberships: {
                where: { status: "active" },
                orderBy: { joinedAt: "asc" },
                select: memberSelect,
            },
        },
    });
    if (!workspace) throw new AppError("Workspace not found", 404);

    const { memberships, ...workspaceFields } = workspace;
    res.status(200).json({
        status: "success",
        data: { workspace: { ...workspaceFields, role: membership.role, members: memberships } },
    });
});

// ─── Rename (Owner only — enforced by the route) ─────────────────────
export const renameWorkspace = catchAsync(async (req, res) => {
    const membership = requireMembership(req);
    const name = normalizeWorkspaceName(req.body.name);

    const workspace = await prisma.$transaction(async (tx) => {
        const previous = await tx.workspace.findUniqueOrThrow({ where: { id: membership.workspaceId }, select: { name: true } });
        const renamed = await tx.workspace.update({
            where: { id: membership.workspaceId },
            data: { name },
            select: { id: true, name: true },
        });
        if (previous.name !== renamed.name) {
            await recordActivity(tx, {
                workspaceId: renamed.id,
                actorId: membership.userId,
                entityType: "workspace",
                entityId: renamed.id,
                action: "workspace.renamed",
                changes: { name: { from: previous.name, to: renamed.name } },
                summary: renamed.name,
            });
        }
        return renamed;
    });

    logger.info(`Workspace renamed workspaceId=${workspace.id} by userId=${membership.userId}`);
    res.status(200).json({ status: "success", data: { workspace } });
});
