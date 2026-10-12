import validator from "validator";
import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger from "../utils/logger.js";
import routeParam from "../utils/routeParam.js";
import { generateSecureToken, hashSecureToken } from "../utils/secureToken.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { currentMonth, parseMonth, summarizeMonth, summarizeTrend, type WorkspaceScope } from "../services/performanceService.js";

// ─── Monthly performance summary + share links ─────────────────────

// A person can keep a few links per month (e.g. one per person they shared with, so each
// can be revoked on its own) — but not an unbounded number.
const MAX_ACTIVE_SHARES = 20;
const MAX_SCOPE_WORKSPACES = 50;

// The workspaces someone is in right now (not ones they've left, or that were deleted).
const currentWorkspaceIds = async (userId: string) =>
    (await prisma.membership.findMany({ where: { userId, status: "active", workspace: { deletedAt: null } }, select: { workspaceId: true } })).map(
        (membership) => membership.workspaceId
    );

// A chosen list of workspaces: each must be one they're in now. Accepts an array (JSON
// body) or "id,id" (query string). Empty or missing = null (every workspace).
const parseWorkspaceScope = async (raw: unknown, userId: string): Promise<WorkspaceScope> => {
    const values = Array.isArray(raw) ? raw : typeof raw === "string" && raw ? raw.split(",") : [];
    if (values.length === 0) return null;
    if (values.length > MAX_SCOPE_WORKSPACES || !values.every((value) => typeof value === "string" && validator.isUUID(value))) {
        throw new AppError("We couldn't read the workspaces you picked. Choose them again.", 400);
    }
    const chosen = [...new Set(values as string[])];
    const mine = new Set(await currentWorkspaceIds(userId));
    if (!chosen.every((workspaceId) => mine.has(workspaceId))) {
        throw new AppError("One of those workspaces isn't yours to include any more. Refresh and choose again.", 404);
    }
    return chosen;
};

// GET /api/v1/performance?month=YYYY-MM&workspaces=id,id
// Your month (default: this month) + 6-month trend, for every workspace or the chosen ones.
export const getMyPerformance = catchAsync(async (req, res) => {
    const user = requireUser(req);
    const month = parseMonth(req.query.month, currentMonth(user.timezone));
    const scope = await parseWorkspaceScope(req.query.workspaces, user.id);
    const [summary, trend] = await Promise.all([summarizeMonth(user.id, user.timezone, month, scope), summarizeTrend(user.id, user.timezone, month, scope)]);
    res.status(200).json({ status: "success", data: { summary, trend, scope: { workspaceIds: scope } } });
});

const shareSelect = {
    id: true,
    month: true,
    createdAt: true,
    allWorkspaces: true,
    showWorkspaceNames: true,
    workspaces: { select: { workspace: { select: { id: true, name: true } } } },
} as const;

type ShareRow = { workspaces: { workspace: { id: string; name: string } }[] } & Record<string, unknown>;
const toShareResponse = <Row extends ShareRow>({ workspaces, ...share }: Row) => ({ ...share, workspaces: workspaces.map((entry) => entry.workspace) });

// GET /api/v1/performance/shares — your active share links (never the tokens themselves).
export const listMyShares = catchAsync(async (req, res) => {
    const shares = await prisma.performanceShare.findMany({
        where: { userId: requireUser(req).id, revokedAt: null },
        select: shareSelect,
        orderBy: { createdAt: "desc" },
    });
    res.status(200).json({ status: "success", data: { shares: shares.map(toShareResponse) } });
});

// POST /api/v1/performance/shares  { month, workspaceIds: [...], showWorkspaceNames? }
// A new link for the chosen workspaces. The token is in this response only; we store its
// hash, so a lost link can't be shown again (make a new one).
export const createShare = catchAsync(async (req, res) => {
    const user = requireUser(req);
    const month = parseMonth(req.body.month, currentMonth(user.timezone));
    const workspaceIds = await parseWorkspaceScope(req.body.workspaceIds, user.id);
    if (!workspaceIds) throw new AppError("Choose at least one workspace to share.", 400);
    const showWorkspaceNames = req.body.showWorkspaceNames === true;
    const activeCount = await prisma.performanceShare.count({ where: { userId: user.id, revokedAt: null } });
    if (activeCount >= MAX_ACTIVE_SHARES) throw new AppError(`You can have ${MAX_ACTIVE_SHARES} active links. Revoke one you no longer need first.`, 409);

    const token = generateSecureToken();
    const share = await prisma.performanceShare.create({
        data: {
            userId: user.id,
            month,
            tokenHash: hashSecureToken(token),
            showWorkspaceNames,
            workspaces: { create: workspaceIds.map((workspaceId) => ({ workspaceId })) },
        },
        select: shareSelect,
    });
    logger.info(`Performance share created shareId=${share.id} userId=${user.id} month=${month} workspaces=${workspaceIds.length}`);
    res.status(201).json({ status: "success", data: { share: { ...toShareResponse(share), token } } });
});

// DELETE /api/v1/performance/shares/:shareId — the link stops working at once.
export const revokeShare = catchAsync(async (req, res) => {
    const shareId = routeParam(req, "shareId");
    if (!shareId || !validator.isUUID(shareId)) throw new AppError("That link was already turned off. Refresh to see the latest.", 404);
    const { count } = await prisma.performanceShare.updateMany({
        where: { id: shareId, userId: requireUser(req).id, revokedAt: null },
        data: { revokedAt: new Date() },
    });
    if (count === 0) throw new AppError("That link was already turned off. Refresh to see the latest.", 404);
    res.status(204).send();
});

// GET /api/v1/performance/shared/:token — public: whoever holds the link sees the owner's
// name and that month's numbers for the workspaces they chose. Revoked links, and suspended
// accounts, are 404.
// NOTE: a chosen workspace counts only while the owner is still in it and it isn't deleted;
// when none are left, the link stops working. The names show only if the owner chose that.
export const viewSharedPerformance = catchAsync(async (req, res) => {
    const token = routeParam(req, "token");
    const share = token
        ? await prisma.performanceShare.findFirst({
              where: { tokenHash: hashSecureToken(token), revokedAt: null, user: { suspendedAt: null } },
              include: {
                  user: { select: { id: true, name: true, photo: true, timezone: true } },
                  workspaces: { select: { workspace: { select: { id: true, name: true } } } },
              },
          })
        : null;
    if (!share) throw new AppError("This link isn't available. It may have been revoked.", 404);

    let scope: WorkspaceScope = null;
    let workspaceNames: string[] = [];
    if (!share.allWorkspaces) {
        const stillIn = new Set(await currentWorkspaceIds(share.user.id));
        const included = share.workspaces.map((entry) => entry.workspace).filter((workspace) => stillIn.has(workspace.id));
        if (included.length === 0) throw new AppError("This link isn't available. It may have been revoked.", 404);
        scope = included.map((workspace) => workspace.id);
        workspaceNames = included.map((workspace) => workspace.name);
    }

    const [summary, trend] = await Promise.all([
        summarizeMonth(share.user.id, share.user.timezone, share.month, scope),
        summarizeTrend(share.user.id, share.user.timezone, share.month, scope),
    ]);
    res.status(200).json({
        status: "success",
        data: {
            owner: { name: share.user.name, photo: share.user.photo },
            summary,
            trend,
            scope: {
                allWorkspaces: share.allWorkspaces,
                workspaceCount: share.allWorkspaces ? null : workspaceNames.length,
                workspaceNames: share.showWorkspaceNames ? workspaceNames : null,
            },
        },
    });
});
