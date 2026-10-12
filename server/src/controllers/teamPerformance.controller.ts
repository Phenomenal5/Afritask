import validator from "validator";
import prisma from "../config/prisma.js";
import type { Membership } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import routeParam from "../utils/routeParam.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { requireMembership } from "../middlewares/workspaceAccess.middleware.js";
import { currentMonth, parseMonth, summarizeMonth, summarizeTrend } from "../services/performanceService.js";

// ─── Team performance: one workspace's members (Owner and Admins only) ─────────────────────
// Each member's numbers count ONLY this workspace's work, never what they do elsewhere.
// Members can't open this (the route allows Owner and Admin). An Admin sees the members and
// the other Admins, but not the Owner: the Owner's numbers are theirs to share.
// Months use each member's own timezone, like their personal view.

const memberSelect = { id: true, role: true, user: { select: { id: true, name: true, photo: true, timezone: true } } } as const;

// The memberships this viewer may see in their workspace.
const visibleMembers = (viewer: Membership) => ({
    workspaceId: viewer.workspaceId,
    status: "active" as const,
    ...(viewer.role !== "owner" && { role: { not: "owner" as const } }),
});

const toMember = (member: { id: string; role: string; user: { id: string; name: string; photo: string | null } }) => ({
    membershipId: member.id,
    role: member.role,
    user: { id: member.user.id, name: member.user.name, photo: member.user.photo },
});

// GET /api/v1/workspaces/:workspaceId/performance?month=YYYY-MM
// Every visible member with their month in this workspace.
export const listTeamPerformance = catchAsync(async (req, res) => {
    const viewer = requireMembership(req);
    const month = parseMonth(req.query.month, currentMonth(requireUser(req).timezone));
    const members = await prisma.membership.findMany({ where: visibleMembers(viewer), select: memberSelect, orderBy: { user: { name: "asc" } } });

    const scope = [viewer.workspaceId];
    const rows = await Promise.all(
        members.map(async (member) => ({ ...toMember(member), summary: await summarizeMonth(member.user.id, member.user.timezone, month, scope) }))
    );
    res.status(200).json({ status: "success", data: { month, members: rows } });
});

// GET /api/v1/workspaces/:workspaceId/performance/:membershipId?month=YYYY-MM
// One member's month in this workspace, with the six-month trend.
export const getMemberPerformance = catchAsync(async (req, res) => {
    const viewer = requireMembership(req);
    const membershipId = routeParam(req, "membershipId");
    if (!membershipId || !validator.isUUID(membershipId)) throw new AppError("That person isn't in this workspace any more. Refresh the list.", 404);
    // NOTE: the Owner is answered exactly like a stranger (404) for an Admin, so an Admin
    // can't even confirm whose numbers they're not allowed to see.
    const member = await prisma.membership.findFirst({ where: { id: membershipId, ...visibleMembers(viewer) }, select: memberSelect });
    if (!member) throw new AppError("That person isn't in this workspace any more. Refresh the list.", 404);

    const month = parseMonth(req.query.month, currentMonth(requireUser(req).timezone));
    const scope = [viewer.workspaceId];
    const [summary, trend] = await Promise.all([
        summarizeMonth(member.user.id, member.user.timezone, month, scope),
        summarizeTrend(member.user.id, member.user.timezone, month, scope),
    ]);
    res.status(200).json({ status: "success", data: { member: toMember(member), summary, trend } });
});
