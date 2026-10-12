import validator from "validator";
import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger from "../utils/logger.js";
import routeParam from "../utils/routeParam.js";
import { generateSecureToken, hashSecureToken } from "../utils/secureToken.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { currentMonth, parseMonth, summarizeMonth, summarizeTrend } from "../services/performanceService.js";

// ─── Monthly performance summary + share links ─────────────────────

// A person can keep a few links per month (e.g. one per person they shared with, so each
// can be revoked on its own) — but not an unbounded number.
const MAX_ACTIVE_SHARES = 20;

// GET /api/v1/performance?month=YYYY-MM — your month (default: this month) + 6-month trend.
export const getMyPerformance = catchAsync(async (req, res) => {
    const user = requireUser(req);
    const month = parseMonth(req.query.month, currentMonth(user.timezone));
    const [summary, trend] = await Promise.all([summarizeMonth(user.id, user.timezone, month), summarizeTrend(user.id, user.timezone, month)]);
    res.status(200).json({ status: "success", data: { summary, trend } });
});

// GET /api/v1/performance/shares — your active share links (never the tokens themselves).
export const listMyShares = catchAsync(async (req, res) => {
    const shares = await prisma.performanceShare.findMany({
        where: { userId: requireUser(req).id, revokedAt: null },
        select: { id: true, month: true, createdAt: true },
        orderBy: { createdAt: "desc" },
    });
    res.status(200).json({ status: "success", data: { shares } });
});

// POST /api/v1/performance/shares  { month } — a new link. The token is in this response
// only; we store its hash, so a lost link can't be shown again (make a new one).
export const createShare = catchAsync(async (req, res) => {
    const user = requireUser(req);
    const month = parseMonth(req.body?.month, currentMonth(user.timezone));
    const activeCount = await prisma.performanceShare.count({ where: { userId: user.id, revokedAt: null } });
    if (activeCount >= MAX_ACTIVE_SHARES) throw new AppError(`You can have ${MAX_ACTIVE_SHARES} active links. Revoke one you no longer need first.`, 409);

    const token = generateSecureToken();
    const share = await prisma.performanceShare.create({
        data: { userId: user.id, month, tokenHash: hashSecureToken(token) },
        select: { id: true, month: true, createdAt: true },
    });
    logger.info(`Performance share created shareId=${share.id} userId=${user.id} month=${month}`);
    res.status(201).json({ status: "success", data: { share: { ...share, token } } });
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
// name and that month's numbers. Revoked links, and suspended accounts, are 404.
export const viewSharedPerformance = catchAsync(async (req, res) => {
    const token = routeParam(req, "token");
    const share = token
        ? await prisma.performanceShare.findFirst({
              where: { tokenHash: hashSecureToken(token), revokedAt: null, user: { suspendedAt: null } },
              include: { user: { select: { id: true, name: true, photo: true, timezone: true } } },
          })
        : null;
    if (!share) throw new AppError("This link isn't available. It may have been revoked.", 404);

    const [summary, trend] = await Promise.all([
        summarizeMonth(share.user.id, share.user.timezone, share.month),
        summarizeTrend(share.user.id, share.user.timezone, share.month),
    ]);
    res.status(200).json({
        status: "success",
        data: { owner: { name: share.user.name, photo: share.user.photo }, summary, trend },
    });
});
