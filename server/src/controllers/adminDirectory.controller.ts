import validator from "validator";
import prisma from "../config/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger from "../utils/logger.js";
import routeParam from "../utils/routeParam.js";
import { computeSchedule } from "../utils/reminderSchedule.js";
import { requireOperatorContext } from "../middlewares/operatorAuth.middleware.js";
import { recordAdminAudit, requestIp } from "../services/adminAuditService.js";

// ─── Platform directory: accounts and workspaces (SRS SR17 / FR17) ─────────────────────
// Operators see METADATA only — names, emails, status, membership, counts. Never a
// workspace's projects, tasks or comments (SRS SR16). Every suspend/restore needs a reason
// and is written to the audit trail in the same transaction.

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
// NOTE: capped so the offset stays a valid database value (a 500 otherwise).
const MAX_PAGE = 10_000;
const REASON_MIN_LENGTH = 5;
const REASON_MAX_LENGTH = 500;

export const parsePaging = (query: Record<string, unknown>) => {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? DEFAULT_PAGE_SIZE);
    if (!Number.isInteger(page) || page < 1 || page > MAX_PAGE) throw new AppError("We couldn't load that page of tasks. Refresh and try again.", 400);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) throw new AppError(`limit must be between 1 and ${MAX_PAGE_SIZE}`, 400);
    return { page, limit, skip: (page - 1) * limit };
};

export const pageOf = <Item>(items: Item[], total: number, paging: { page: number; limit: number }) => ({
    items,
    pagination: { page: paging.page, limit: paging.limit, total, totalPages: Math.max(1, Math.ceil(total / paging.limit)) },
});

export const parseReason = (reason: unknown): string => {
    const trimmed = typeof reason === "string" ? reason.trim() : "";
    if (trimmed.length < REASON_MIN_LENGTH) throw new AppError(`Give a reason (at least ${REASON_MIN_LENGTH} characters). It's kept in the audit trail.`, 400);
    if (trimmed.length > REASON_MAX_LENGTH) throw new AppError(`Keep the reason under ${REASON_MAX_LENGTH} characters.`, 400);
    return trimmed;
};

const searchText = (query: Record<string, unknown>) => (typeof query.q === "string" ? query.q.trim().slice(0, 200) : "");

const requireId = (id: string | undefined, notFound: string) => {
    if (!id || !validator.isUUID(id)) throw new AppError(notFound, 404);
    return id;
};

// ─── Accounts ─────────────────────

const accountStatus = (user: { suspendedAt: Date | null }) => (user.suspendedAt ? "suspended" : "active");

// Workspaces that still exist from the member's point of view (not deleted by their Owner).
const liveMemberships = { where: { status: "active" as const, workspace: { deletedAt: null } } };

const loadAccountDetail = async (accountId: string) => {
    const user = await prisma.user.findUnique({
        where: { id: accountId },
        select: {
            id: true,
            name: true,
            email: true,
            isVerified: true,
            provider: true,
            createdAt: true,
            suspendedAt: true,
            suspendReason: true,
            memberships: {
                orderBy: { joinedAt: "asc" },
                select: { role: true, status: true, joinedAt: true, workspace: { select: { id: true, name: true } } },
            },
            _count: { select: { memberships: liveMemberships } },
        },
    });
    if (!user) throw new AppError("Account not found", 404);
    const { memberships, _count, ...fields } = user;
    return {
        ...fields,
        status: accountStatus(user),
        workspaceCount: _count.memberships,
        memberships: memberships.map((membership) => ({
            workspaceId: membership.workspace.id,
            workspaceName: membership.workspace.name,
            role: membership.role,
            status: membership.status,
            joinedAt: membership.joinedAt,
        })),
    };
};

// GET /api/admin/accounts?q=&status=active|suspended&page=&limit=
export const searchAccounts = catchAsync(async (req, res) => {
    const paging = parsePaging(req.query);
    const text = searchText(req.query);
    const where: Prisma.UserWhereInput = {};
    if (text) {
        where.OR = validator.isUUID(text)
            ? [{ id: text }]
            : [{ name: { contains: text, mode: "insensitive" } }, { email: { contains: text, mode: "insensitive" } }];
    }
    if (req.query.status === "suspended") where.suspendedAt = { not: null };
    else if (req.query.status === "active") where.suspendedAt = null;

    const [users, total] = await Promise.all([
        prisma.user.findMany({
            where,
            orderBy: [{ createdAt: "desc" }, { id: "asc" }],
            skip: paging.skip,
            take: paging.limit,
            select: { id: true, name: true, email: true, isVerified: true, createdAt: true, suspendedAt: true, _count: { select: { memberships: liveMemberships } } },
        }),
        prisma.user.count({ where }),
    ]);

    const items = users.map(({ _count, suspendedAt, ...user }) => ({ ...user, status: accountStatus({ suspendedAt }), workspaceCount: _count.memberships }));
    res.status(200).json({ status: "success", data: pageOf(items, total, paging) });
});

// GET /api/admin/accounts/:accountId
export const getAccount = catchAsync(async (req, res) => {
    const account = await loadAccountDetail(requireId(routeParam(req, "accountId"), "Account not found"));
    res.status(200).json({ status: "success", data: { account } });
});

// POST /api/admin/accounts/:accountId/suspend  { reason }
// Signs them out everywhere at once (customer AND console sessions) and blocks sign-in.
// Ownership, memberships and assignments are left exactly as they are.
export const suspendAccount = catchAsync(async (req, res) => {
    const { operator } = requireOperatorContext(req);
    const accountId = requireId(routeParam(req, "accountId"), "Account not found");
    const reason = parseReason(req.body?.reason);
    if (accountId === operator.userId) throw new AppError("You can't suspend your own account.", 409);

    await prisma.$transaction(async (transaction) => {
        const { count } = await transaction.user.updateMany({ where: { id: accountId, suspendedAt: null }, data: { suspendedAt: new Date(), suspendReason: reason } });
        if (count === 0) {
            const exists = await transaction.user.count({ where: { id: accountId } });
            throw exists ? new AppError("This account is already suspended.", 409) : new AppError("Account not found", 404);
        }
        await transaction.session.updateMany({ where: { userId: accountId, revokedAt: null }, data: { revokedAt: new Date() } });
        await recordAdminAudit(transaction, { actorId: operator.userId, action: "account.suspended", targetType: "user", targetId: accountId, reason, ipAddress: requestIp(req) });
    });

    logger.info(`Account suspended accountId=${accountId} by operator=${operator.userId}`);
    res.status(200).json({ status: "success", data: { account: await loadAccountDetail(accountId) } });
});

// POST /api/admin/accounts/:accountId/restore  { reason }
// They sign in again from scratch (all sessions were revoked). A separately suspended
// workspace stays suspended.
export const restoreAccount = catchAsync(async (req, res) => {
    const { operator } = requireOperatorContext(req);
    const accountId = requireId(routeParam(req, "accountId"), "Account not found");
    const reason = parseReason(req.body?.reason);

    await prisma.$transaction(async (transaction) => {
        const { count } = await transaction.user.updateMany({ where: { id: accountId, suspendedAt: { not: null } }, data: { suspendedAt: null, suspendReason: null } });
        if (count === 0) {
            const exists = await transaction.user.count({ where: { id: accountId } });
            throw exists ? new AppError("This account isn't suspended.", 409) : new AppError("Account not found", 404);
        }
        await recordAdminAudit(transaction, { actorId: operator.userId, action: "account.restored", targetType: "user", targetId: accountId, reason, ipAddress: requestIp(req) });
    });

    logger.info(`Account restored accountId=${accountId} by operator=${operator.userId}`);
    res.status(200).json({ status: "success", data: { account: await loadAccountDetail(accountId) } });
});

// ─── Workspaces ─────────────────────

const workspaceStatus = (workspace: { suspendedAt: Date | null; deletedAt: Date | null }) =>
    workspace.deletedAt ? "deleted" : workspace.suspendedAt ? "suspended" : "active";

const workspaceSelect = {
    id: true,
    name: true,
    createdAt: true,
    suspendedAt: true,
    suspendReason: true,
    deletedAt: true,
    memberships: {
        where: { role: "owner", status: "active" },
        take: 1,
        select: { user: { select: { id: true, name: true, email: true } } },
    },
    _count: { select: { memberships: { where: { status: "active" } }, projects: true, tasks: true } },
} as const satisfies Prisma.WorkspaceSelect;

type WorkspaceRow = Prisma.WorkspaceGetPayload<{ select: typeof workspaceSelect }>;

const toWorkspaceSummary = (workspace: WorkspaceRow) => ({
    id: workspace.id,
    name: workspace.name,
    status: workspaceStatus(workspace),
    createdAt: workspace.createdAt,
    memberCount: workspace._count.memberships,
    owner: workspace.memberships[0]?.user ?? null,
});

const toWorkspaceDetail = (workspace: WorkspaceRow) => ({
    ...toWorkspaceSummary(workspace),
    suspendedAt: workspace.suspendedAt,
    suspendReason: workspace.suspendReason,
    deletedAt: workspace.deletedAt,
    // Counts only — the console never lists a workspace's content.
    counts: { projects: workspace._count.projects, tasks: workspace._count.tasks },
});

const loadWorkspaceDetail = async (workspaceId: string) => {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: workspaceSelect });
    if (!workspace) throw new AppError("We couldn't open this workspace. It may have been deleted, or you're no longer a member.", 404);
    return toWorkspaceDetail(workspace);
};

// GET /api/admin/workspaces?q=&status=active|suspended|deleted&page=&limit=
export const searchWorkspaces = catchAsync(async (req, res) => {
    const paging = parsePaging(req.query);
    const text = searchText(req.query);
    const where: Prisma.WorkspaceWhereInput = {};
    if (text) where.OR = validator.isUUID(text) ? [{ id: text }] : [{ name: { contains: text, mode: "insensitive" } }];
    if (req.query.status === "active") Object.assign(where, { suspendedAt: null, deletedAt: null });
    else if (req.query.status === "suspended") Object.assign(where, { suspendedAt: { not: null }, deletedAt: null });
    else if (req.query.status === "deleted") where.deletedAt = { not: null };

    const [workspaces, total] = await Promise.all([
        prisma.workspace.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: paging.skip, take: paging.limit, select: workspaceSelect }),
        prisma.workspace.count({ where }),
    ]);
    res.status(200).json({ status: "success", data: pageOf(workspaces.map(toWorkspaceSummary), total, paging) });
});

// GET /api/admin/workspaces/:workspaceId
export const getWorkspace = catchAsync(async (req, res) => {
    const workspace = await loadWorkspaceDetail(requireId(routeParam(req, "workspaceId"), "We couldn't open this workspace. It may have been deleted, or you're no longer a member."));
    res.status(200).json({ status: "success", data: { workspace } });
});

// POST /api/admin/workspaces/:workspaceId/suspend  { reason }
// Members can't read, change or join it; reminders are suppressed while it's suspended.
export const suspendWorkspace = catchAsync(async (req, res) => {
    const { operator } = requireOperatorContext(req);
    const workspaceId = requireId(routeParam(req, "workspaceId"), "We couldn't open this workspace. It may have been deleted, or you're no longer a member.");
    const reason = parseReason(req.body?.reason);

    await prisma.$transaction(async (transaction) => {
        const current = await transaction.workspace.findUnique({ where: { id: workspaceId }, select: { suspendedAt: true, deletedAt: true } });
        if (!current) throw new AppError("We couldn't open this workspace. It may have been deleted, or you're no longer a member.", 404);
        if (current.deletedAt) throw new AppError("This workspace was deleted by its Owner.", 409);
        if (current.suspendedAt) throw new AppError("This workspace is already suspended.", 409);
        await transaction.workspace.update({ where: { id: workspaceId }, data: { suspendedAt: new Date(), suspendReason: reason } });
        await recordAdminAudit(transaction, { actorId: operator.userId, action: "workspace.suspended", targetType: "workspace", targetId: workspaceId, reason, ipAddress: requestIp(req) });
    });

    logger.info(`Workspace suspended workspaceId=${workspaceId} by operator=${operator.userId}`);
    res.status(200).json({ status: "success", data: { workspace: await loadWorkspaceDetail(workspaceId) } });
});

// POST /api/admin/workspaces/:workspaceId/restore  { reason }
// Re-plans reminders for FUTURE times only, so nothing missed during the suspension arrives
// in a burst (SRS SR17 acceptance).
export const restoreWorkspace = catchAsync(async (req, res) => {
    const { operator } = requireOperatorContext(req);
    const workspaceId = requireId(routeParam(req, "workspaceId"), "We couldn't open this workspace. It may have been deleted, or you're no longer a member.");
    const reason = parseReason(req.body?.reason);

    await prisma.$transaction(async (transaction) => {
        const { count } = await transaction.workspace.updateMany({ where: { id: workspaceId, suspendedAt: { not: null } }, data: { suspendedAt: null, suspendReason: null } });
        if (count === 0) {
            const exists = await transaction.workspace.count({ where: { id: workspaceId } });
            throw exists ? new AppError("This workspace isn't suspended.", 409) : new AppError("We couldn't open this workspace. It may have been deleted, or you're no longer a member.", 404);
        }
        const openTasks = await transaction.task.findMany({
            where: { workspaceId, status: { not: "completed" }, OR: [{ dueAt: { not: null } }, { startAt: { not: null } }] },
            select: { id: true, dueAt: true, dueKind: true, dueTimezone: true, reminderOffset: true, status: true, startAt: true, startKind: true, startTimezone: true, project: { select: { state: true } } },
        });
        for (const task of openTasks) {
            await transaction.task.update({ where: { id: task.id }, data: computeSchedule(task, task.project?.state ?? null) });
        }
        await recordAdminAudit(transaction, { actorId: operator.userId, action: "workspace.restored", targetType: "workspace", targetId: workspaceId, reason, ipAddress: requestIp(req) });
    });

    logger.info(`Workspace restored workspaceId=${workspaceId} by operator=${operator.userId}`);
    res.status(200).json({ status: "success", data: { workspace: await loadWorkspaceDetail(workspaceId) } });
});
