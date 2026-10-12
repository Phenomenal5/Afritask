import validator from "validator";
import prisma from "../config/prisma.js";
import type { Membership, Prisma, WorkspaceRole } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger from "../utils/logger.js";
import routeParam from "../utils/routeParam.js";
import { requireMembership } from "../middlewares/workspaceAccess.middleware.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { recordActivity, type ActivityAction, type ActivityChanges } from "../services/activityService.js";

// ─── Membership lifecycle (SRS SR04, PRD FR04 + §8 protection rules) ─────────────────────
// - Owner sets Admin/Member roles and transfers ownership; Admin removes Members only.
// - Nobody can remove, demote or replace the Owner; the Owner must transfer before leaving.
// - Removal/leaving sets status "removed" (the row is kept so history keeps attribution)
//   and immediately ends workspace access — every request re-checks active membership.

// Runs inside the removal transaction — the ONE path for both "remove" and "leave", so the
// assignment cleanup can never be skipped.
// NOTE: open tasks assigned to the departing member become unassigned in the same
// transaction (PRD J6: no inaccessible work left owned by a former member). Completed
// tasks keep the assignment as history (SRS SR04 proposed default). Each cleared task's
// version is bumped so a teammate's open edit form can't silently re-save the old assignee.
const endMembership = async (transaction: Prisma.TransactionClient, membershipId: string) => {
    const { count } = await transaction.membership.updateMany({
        where: { id: membershipId, status: "active" },
        data: { status: "removed", removedAt: new Date() },
    });
    if (count === 0) throw new AppError("That person is no longer a member", 409);

    await transaction.task.updateMany({
        where: { assigneeMembershipId: membershipId, status: { not: "completed" } },
        data: { assigneeMembershipId: null, version: { increment: 1 } },
    });
};

// The target membership must belong to the SAME workspace as the caller's — a membership id
// from another workspace answers 404, like any other cross-workspace id.
type TargetMembership = Membership & { user: { name: string } };
const loadTargetMembership = async (membershipId: unknown, workspaceId: string): Promise<TargetMembership> => {
    // typeof first: validator.isUUID throws (a 500) on a number or an object.
    if (typeof membershipId !== "string" || !validator.isUUID(membershipId)) throw new AppError("Member not found", 404);
    const target = await prisma.membership.findFirst({
        where: { id: membershipId, workspaceId, status: "active" },
        include: { user: { select: { name: true } } },
    });
    if (!target) throw new AppError("Member not found", 404);
    return target;
};

// A membership event; summary is the member's name at the time.
const memberActivity = (
    target: { id: string; workspaceId: string },
    memberName: string,
    actorId: string,
    action: ActivityAction,
    changes?: ActivityChanges
) => ({ workspaceId: target.workspaceId, actorId, entityType: "membership" as const, entityId: target.id, action, changes, summary: memberName });

// ─── Change a role: Owner only, admin ⇄ member ─────────────────────
export const changeMemberRole = catchAsync(async (req, res) => {
    const callerMembership = requireMembership(req);
    const target = await loadTargetMembership(routeParam(req, "membershipId"), callerMembership.workspaceId);
    const role = req.body.role as WorkspaceRole;

    if (role !== "admin" && role !== "member") {
        throw new AppError("Role must be admin or member. To change the Owner, transfer ownership instead", 400);
    }
    if (target.role === "owner") throw new AppError("The Owner's role can only change through ownership transfer", 409);

    const updated = await prisma.$transaction(async (transaction) => {
        const updatedMembership = await transaction.membership.update({ where: { id: target.id }, data: { role } });
        if (target.role !== role) {
            await recordActivity(transaction, memberActivity(target, target.user.name, callerMembership.userId, "member.role_changed", {
                role: { from: target.role, to: role },
            }));
        }
        return updatedMembership;
    });

    logger.info(`Member role changed membershipId=${target.id} ${target.role}→${role} by userId=${callerMembership.userId}`);
    res.status(200).json({ status: "success", data: { member: { id: updated.id, role: updated.role } } });
});

// ─── Remove someone else ─────────────────────
export const removeMember = catchAsync(async (req, res) => {
    const callerMembership = requireMembership(req);
    const target = await loadTargetMembership(routeParam(req, "membershipId"), callerMembership.workspaceId);

    if (target.id === callerMembership.id) throw new AppError("Use “Leave workspace” to remove yourself", 400);
    if (target.role === "owner") throw new AppError("The Owner can't be removed", 403);
    // Admins may remove Members; managing Admins is reserved to the Owner (PRD §8).
    if (callerMembership.role === "admin" && target.role !== "member") {
        throw new AppError("Only the Owner can remove an Admin", 403);
    }

    await prisma.$transaction(async (transaction) => {
        await endMembership(transaction, target.id);
        await recordActivity(transaction, memberActivity(target, target.user.name, callerMembership.userId, "member.removed"));
    });

    logger.info(`Member removed membershipId=${target.id} by userId=${callerMembership.userId}`);
    res.status(200).json({ status: "success", message: "Member removed" });
});

// ─── Leave (Admin or Member) ─────────────────────
export const leaveWorkspace = catchAsync(async (req, res) => {
    const callerMembership = requireMembership(req);

    if (callerMembership.role === "owner") {
        throw new AppError("Transfer ownership to another member before leaving", 409);
    }

    await prisma.$transaction(async (transaction) => {
        await endMembership(transaction, callerMembership.id);
        await recordActivity(transaction, memberActivity(callerMembership, requireUser(req).name, callerMembership.userId, "member.left"));
    });

    logger.info(`Member left membershipId=${callerMembership.id} workspaceId=${callerMembership.workspaceId}`);
    res.status(200).json({ status: "success", message: "You left the workspace" });
});

// ─── Transfer ownership: Owner → an existing active member ─────────────────────
export const transferOwnership = catchAsync(async (req, res) => {
    const callerMembership = requireMembership(req);
    const target = await loadTargetMembership(req.body.membershipId, callerMembership.workspaceId);
    if (target.id === callerMembership.id) throw new AppError("You're already the Owner", 400);

    // NOTE: order matters. The partial unique index allows only ONE active owner, so the
    // current Owner is demoted (to Admin) BEFORE the target is promoted, in one transaction.
    // Both steps are conditional updates: if the caller stopped being Owner (a concurrent
    // transfer) or the target left meanwhile, the whole transaction rolls back — leaving
    // exactly one Owner either way (SRS AC08).
    await prisma.$transaction(async (transaction) => {
        const demoted = await transaction.membership.updateMany({
            where: { id: callerMembership.id, role: "owner", status: "active" },
            data: { role: "admin" },
        });
        if (demoted.count === 0) throw new AppError("You're no longer the Owner of this workspace", 409);

        const promoted = await transaction.membership.updateMany({
            where: { id: target.id, workspaceId: callerMembership.workspaceId, status: "active" },
            data: { role: "owner" },
        });
        if (promoted.count === 0) throw new AppError("That person is no longer a member", 409);

        await recordActivity(transaction, memberActivity(target, target.user.name, callerMembership.userId, "ownership.transferred", {
            owner: { from: requireUser(req).name, to: target.user.name },
        }));
    });

    logger.info(`Ownership transferred workspaceId=${callerMembership.workspaceId} from membershipId=${callerMembership.id} to membershipId=${target.id}`);
    res.status(200).json({ status: "success", message: "Ownership transferred. You're now an Admin." });
});
