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
        where: { userId, status: "active", workspace: { deletedAt: null } },
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
    const workspace = await prisma.$transaction(async (transaction) => {
        const createdWorkspace = await transaction.workspace.create({
            data: {
                name,
                memberships: { create: { userId: user.id, role: "owner" } },
            },
            select: { id: true, name: true, createdAt: true },
        });
        await recordActivity(transaction, {
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
    if (!workspace) throw new AppError("We couldn't open this workspace. It may have been deleted, or you're no longer a member.", 404);

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

    const workspace = await prisma.$transaction(async (transaction) => {
        const previous = await transaction.workspace.findUniqueOrThrow({ where: { id: membership.workspaceId }, select: { name: true } });
        const renamed = await transaction.workspace.update({
            where: { id: membership.workspaceId },
            data: { name },
            select: { id: true, name: true },
        });
        if (previous.name !== renamed.name) {
            await recordActivity(transaction, {
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

// ─── Delete a workspace (Owner only — enforced by the route) ─────────────────────
// Two outcomes, decided by whose work is in it:
// - Only the Owner's own records → deleted outright, with everything in it.
// - Someone else has records here (tasks, comments, projects or changes they made) →
//   SOFT deleted: closed to every member at once and hidden from lists, but their work is
//   kept rather than destroyed by one person's decision.
// Being invited, joining or leaving isn't a record; doing work is.

// Distinct people other than the Owner who have left a record in the workspace.
const otherContributors = async (workspaceId: string, ownerUserId: string) => {
    const notOwner = { not: ownerUserId };
    const [taskAuthors, commentAuthors, projectAuthors, activityActors] = await Promise.all([
        prisma.task.findMany({ where: { workspaceId, creatorId: notOwner }, distinct: ["creatorId"], select: { creatorId: true } }),
        prisma.comment.findMany({ where: { workspaceId, authorId: notOwner }, distinct: ["authorId"], select: { authorId: true } }),
        prisma.project.findMany({ where: { workspaceId, createdById: notOwner }, distinct: ["createdById"], select: { createdById: true } }),
        prisma.activity.findMany({
            where: { workspaceId, actorId: notOwner, NOT: { action: { startsWith: "member." } } },
            distinct: ["actorId"],
            select: { actorId: true },
        }),
    ]);
    return new Set([
        ...taskAuthors.map((row) => row.creatorId),
        ...commentAuthors.map((row) => row.authorId),
        ...projectAuthors.map((row) => row.createdById),
        ...activityActors.map((row) => row.actorId),
    ]).size;
};

const deletionPlan = async (workspaceId: string, ownerUserId: string) => {
    const [contributors, taskCount, projectCount, memberCount] = await Promise.all([
        otherContributors(workspaceId, ownerUserId),
        prisma.task.count({ where: { workspaceId } }),
        prisma.project.count({ where: { workspaceId } }),
        prisma.membership.count({ where: { workspaceId, status: "active" } }),
    ]);
    return {
        mode: contributors > 0 ? ("soft" as const) : ("permanent" as const),
        otherContributors: contributors,
        counts: { tasks: taskCount, projects: projectCount, members: memberCount },
    };
};

// GET /api/workspaces/:workspaceId/deletion-preview — what deleting would do, before you confirm.
export const previewWorkspaceDeletion = catchAsync(async (req, res) => {
    const membership = requireMembership(req);
    res.status(200).json({ status: "success", data: await deletionPlan(membership.workspaceId, membership.userId) });
});

// DELETE /api/workspaces/:workspaceId — body { confirmName } must equal the workspace's name.
export const deleteWorkspace = catchAsync(async (req, res) => {
    const membership = requireMembership(req);
    const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: membership.workspaceId }, select: { id: true, name: true } });
    // NOTE: typed confirmation (SRS §2) — a stray click can't delete a workspace.
    // NOTE: Express 5 leaves req.body undefined when no body is sent — read it defensively.
    const confirmName: unknown = req.body?.confirmName;
    if (typeof confirmName !== "string" || confirmName.trim() !== workspace.name) {
        throw new AppError("Type the workspace's name exactly to confirm.", 400);
    }

    const plan = await deletionPlan(workspace.id, membership.userId);
    if (plan.mode === "permanent") {
        await prisma.$transaction(async (transaction) => {
            // Tasks first: a project can't be removed while tasks still point at it.
            await transaction.task.deleteMany({ where: { workspaceId: workspace.id } });
            await transaction.workspace.delete({ where: { id: workspace.id } });
        });
    } else {
        await prisma.$transaction(async (transaction) => {
            const { count } = await transaction.workspace.updateMany({
                where: { id: workspace.id, deletedAt: null },
                data: { deletedAt: new Date(), deletedById: membership.userId },
            });
            if (count === 0) throw new AppError("This workspace was already deleted.", 409);
            // Nobody can join a closed workspace, and nothing in it sends reminders any more.
            await transaction.invitation.updateMany({ where: { workspaceId: workspace.id, status: "pending" }, data: { status: "revoked", respondedAt: new Date() } });
            await transaction.task.updateMany({ where: { workspaceId: workspace.id }, data: { remindAt: null, overdueCheckAt: null } });
            await recordActivity(transaction, {
                workspaceId: workspace.id,
                actorId: membership.userId,
                entityType: "workspace",
                entityId: workspace.id,
                action: "workspace.deleted",
                summary: workspace.name,
                changes: { mode: { from: null, to: "soft" } },
            });
        });
    }

    logger.info(`Workspace deleted (${plan.mode}) workspaceId=${workspace.id} by userId=${membership.userId}`);
    res.status(200).json({ status: "success", data: { mode: plan.mode } });
});
