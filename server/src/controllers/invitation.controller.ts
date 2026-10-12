import validator from "validator";
import prisma from "../config/prisma.js";
import { recordActivity } from "../services/activityService.js";
import { notifyInvitation } from "../services/notificationService.js";
import { dispatchNotificationsSoon } from "../services/realtimeService.js";
import type { Invitation, Membership, WorkspaceRole } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger, { errorMessage } from "../utils/logger.js";
import routeParam from "../utils/routeParam.js";
import { generateSecureToken, hashSecureToken } from "../utils/secureToken.js";
import { sendInvitationEmail } from "../utils/email.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { notFoundUnlessSuspended, requireActiveMembership, requireMembership } from "../middlewares/workspaceAccess.middleware.js";

// ─── Email invitations (SRS SR03, PRD journeys J2/J3) ─────────────────────

// PRD proposed default: invitations expire after seven days.
const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

type InvitableRole = Extract<WorkspaceRole, "admin" | "member">;

// Who may offer which role: Owner → admin|member, Admin → member only (PRD §8).
const invitableRolesFor = (inviterRole: WorkspaceRole): InvitableRole[] =>
    inviterRole === "owner" ? ["admin", "member"] : inviterRole === "admin" ? ["member"] : [];

const isExpired = (invitation: Pick<Invitation, "expiresAt">) => invitation.expiresAt.getTime() <= Date.now();

// What a manager or recipient sees. Never the token hash.
const publicInvitation = (invitation: Invitation & { inviter?: { name: string } }) => ({
    id: invitation.id,
    workspaceId: invitation.workspaceId,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status === "pending" && isExpired(invitation) ? "expired" : invitation.status,
    deliveryStatus: invitation.deliveryStatus,
    expiresAt: invitation.expiresAt,
    createdAt: invitation.createdAt,
    inviterName: invitation.inviter?.name,
});

const normalizeInviteEmail = (email: unknown): string => {
    if (typeof email !== "string" || !validator.isEmail(email.trim())) {
        throw new AppError("Enter a full email address, like name@example.com.", 400);
    }
    return email.trim().toLowerCase();
};

const assertInvitableRole = (role: unknown, inviterRole: WorkspaceRole): InvitableRole => {
    const allowedRoles = invitableRolesFor(inviterRole);
    if (!allowedRoles.includes(role as InvitableRole)) {
        throw new AppError(
            allowedRoles.length > 1 ? "Role must be admin or member" : "Admins can only invite Members",
            inviterRole === "admin" && role === "admin" ? 403 : 400
        );
    }
    return role as InvitableRole;
};

// Issue a fresh link for an invitation row and try to email it. Delivery failure keeps the
// invitation pending with deliveryStatus "failed" so a manager can resend (PRD FR03).
const issueAndSendInvitation = async (invitationId: string) => {
    const rawToken = generateSecureToken();
    const invitation = await prisma.invitation.update({
        where: { id: invitationId },
        data: {
            tokenHash: hashSecureToken(rawToken),
            expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
            deliveryStatus: "pending",
        },
        include: { workspace: { select: { name: true } }, inviter: { select: { name: true } } },
    });

    let deliveryStatus: "sent" | "failed" = "sent";
    try {
        await sendInvitationEmail(invitation.email, {
            workspaceName: invitation.workspace.name,
            inviterName: invitation.inviter.name,
            role: invitation.role as InvitableRole,
            token: rawToken,
        });
    } catch (error) {
        deliveryStatus = "failed";
        logger.error(`Invitation email failed invitationId=${invitation.id}: ${errorMessage(error)}`);
    }

    return prisma.invitation.update({
        where: { id: invitation.id },
        data: { deliveryStatus },
        include: { inviter: { select: { name: true } } },
    });
};

// Managers act on an invitation through their membership in ITS workspace. A non-manager
// or outsider gets 404 (no confirmation the invitation exists).
const loadInvitationForManager = async (invitationId: string | undefined, userId: string) => {
    if (!invitationId || !validator.isUUID(invitationId)) throw new AppError("This invitation was withdrawn or replaced. Refresh to see the latest.", 404);
    const invitation = await prisma.invitation.findUnique({ where: { id: invitationId } });
    if (!invitation) throw new AppError("This invitation was withdrawn or replaced. Refresh to see the latest.", 404);

    const membership = await requireActiveMembership(invitation.workspaceId, userId).catch(notFoundUnlessSuspended("This invitation was withdrawn or replaced. Refresh to see the latest."));
    if (invitableRolesFor(membership.role).length === 0) throw new AppError("This invitation was withdrawn or replaced. Refresh to see the latest.", 404);
    // An Admin can manage Member invitations, but not Admin ones (PRD §8: managing Admins is Owner-only).
    if (!invitableRolesFor(membership.role).includes(invitation.role as InvitableRole)) {
        throw new AppError("Only the Owner can manage Admin invitations", 403);
    }
    return { invitation, membership };
};

// ─── Manager side: /api/workspaces/:workspaceId/invitations ─────────────────────

export const createInvitation = catchAsync(async (req, res) => {
    const membership = requireMembership(req);
    const email = normalizeInviteEmail(req.body.email);
    const role = assertInvitableRole(req.body.role ?? "member", membership.role);

    // Reject inviting someone who is already an active member (PRD FR03).
    const existingMember = await prisma.membership.findFirst({
        where: {
            workspaceId: membership.workspaceId,
            status: "active",
            user: { email: { equals: email, mode: "insensitive" } },
        },
        select: { id: true },
    });
    if (existingMember) throw new AppError("That person is already a member of this workspace", 409);

    const pendingInvitation = await prisma.invitation.findFirst({
        where: { workspaceId: membership.workspaceId, email, status: "pending" },
        select: { id: true },
    });
    if (pendingInvitation) {
        throw new AppError("That email already has a pending invitation. Resend it instead", 409);
    }

    // Placeholder hash: issueAndSendInvitation sets the real one (it also handles resend).
    // An existing account also hears about it in-app (in the same transaction).
    const created = await prisma.$transaction(async (transaction) => {
        const createdInvitation = await transaction.invitation.create({
            data: {
                workspaceId: membership.workspaceId,
                email,
                role,
                inviterId: membership.userId,
                tokenHash: hashSecureToken(generateSecureToken()),
                expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
            },
            include: { workspace: { select: { name: true } } },
        });
        await notifyInvitation(transaction, createdInvitation, createdInvitation.workspace.name, membership.userId);
        return createdInvitation;
    });
    const invitation = await issueAndSendInvitation(created.id);

    logger.info(`Invitation created invitationId=${invitation.id} workspaceId=${membership.workspaceId} by userId=${membership.userId}`);
    dispatchNotificationsSoon();
    res.status(201).json({ status: "success", data: { invitation: publicInvitation(invitation) } });
});

export const listWorkspaceInvitations = catchAsync(async (req, res) => {
    const membership = requireMembership(req);

    const invitations = await prisma.invitation.findMany({
        where: { workspaceId: membership.workspaceId, status: "pending" },
        orderBy: { createdAt: "desc" },
        include: { inviter: { select: { name: true } } },
    });

    res.status(200).json({
        status: "success",
        results: invitations.length,
        data: { invitations: invitations.map(publicInvitation) },
    });
});

// ─── Manager side: /api/invitations/:invitationId/(resend|revoke) ─────────────────────

export const resendInvitation = catchAsync(async (req, res) => {
    const { invitation: existing } = await loadInvitationForManager(routeParam(req, "invitationId"), requireUser(req).id);
    if (existing.status !== "pending") throw new AppError("Only invitations that haven't been answered yet can be sent again.", 409);

    // A new token replaces the old one, so links from earlier emails stop working.
    const invitation = await issueAndSendInvitation(existing.id);

    logger.info(`Invitation resent invitationId=${invitation.id}`);
    res.status(200).json({ status: "success", data: { invitation: publicInvitation(invitation) } });
});

export const revokeInvitation = catchAsync(async (req, res) => {
    const { invitation: existing } = await loadInvitationForManager(routeParam(req, "invitationId"), requireUser(req).id);

    const { count } = await prisma.invitation.updateMany({
        where: { id: existing.id, status: "pending" },
        data: { status: "revoked", respondedAt: new Date() },
    });
    if (count === 0) throw new AppError("This invitation was already answered or withdrawn.", 409);

    logger.info(`Invitation revoked invitationId=${existing.id}`);
    res.status(200).json({ status: "success", message: "Invitation revoked" });
});

// ─── Recipient side ─────────────────────

// Public: what the emailed link points at. Shows enough to decide (workspace, inviter,
// role, invited email) — the link holder already has the invitation.
export const previewInvitation = catchAsync(async (req, res) => {
    const token = routeParam(req, "token");
    if (!token) throw new AppError("This invitation was withdrawn or replaced. Refresh to see the latest.", 404);

    const invitation = await prisma.invitation.findUnique({
        where: { tokenHash: hashSecureToken(token) },
        include: { workspace: { select: { name: true } }, inviter: { select: { name: true } } },
    });
    // A replaced (resent) link no longer matches any hash and lands here too.
    if (!invitation) throw new AppError("This invitation link is invalid or has been replaced", 404);

    res.status(200).json({
        status: "success",
        data: { invitation: { ...publicInvitation(invitation), workspaceName: invitation.workspace.name } },
    });
});

// Invitations waiting for the signed-in user (the in-app half of journey J2).
export const listMyInvitations = catchAsync(async (req, res) => {
    const user = requireUser(req);

    const invitations = await prisma.invitation.findMany({
        where: {
            email: { equals: user.email, mode: "insensitive" },
            status: "pending",
            expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
        include: { workspace: { select: { name: true } }, inviter: { select: { name: true } } },
    });

    res.status(200).json({
        status: "success",
        results: invitations.length,
        data: {
            invitations: invitations.map((invitation) => ({
                ...publicInvitation(invitation),
                workspaceName: invitation.workspace.name,
            })),
        },
    });
});

// Find the invitation a respond request refers to: by emailed token, or by id for the
// in-app list. Either way it must be addressed to the signed-in account.
const loadInvitationForRecipient = async (body: { token?: unknown; invitationId?: unknown }, userEmail: string) => {
    let invitation: Invitation | null = null;
    if (typeof body.token === "string" && body.token) {
        invitation = await prisma.invitation.findUnique({ where: { tokenHash: hashSecureToken(body.token) } });
    } else if (typeof body.invitationId === "string" && validator.isUUID(body.invitationId)) {
        invitation = await prisma.invitation.findUnique({ where: { id: body.invitationId } });
    } else {
        throw new AppError("This invitation link is incomplete. Open it from your email again.", 400);
    }
    if (!invitation) throw new AppError("This invitation link is invalid or has been replaced", 404);

    // NOTE: opening the link grants nothing — only the account the invite was SENT TO can
    // act on it (PRD J3). A different signed-in account must switch or register.
    if (invitation.email !== userEmail.toLowerCase()) {
        throw new AppError(
            `This invitation is for ${invitation.email}. Sign in with that email to respond.`,
            403
        );
    }
    if (invitation.status !== "pending") throw new AppError("This invitation can't be used any more. Ask for a new one.", 409);
    if (isExpired(invitation)) throw new AppError("This invitation has expired. Ask for a new one.", 410);
    return invitation;
};

export const acceptInvitation = catchAsync(async (req, res) => {
    const user = requireUser(req);
    // Sessions only exist for verified accounts (login refuses unverified ones), so a
    // signed-in caller satisfies "verified account matching the invited email".
    const invitation = await loadInvitationForRecipient(req.body, user.email);
    // A workspace an operator suspended (or its Owner deleted) can't take new members (SRS SR17).
    const target = await prisma.workspace.findUnique({ where: { id: invitation.workspaceId }, select: { suspendedAt: true, deletedAt: true } });
    if (target?.suspendedAt || target?.deletedAt) throw new AppError("This workspace isn't accepting new members right now.", 409);

    // One transaction: consume the invitation and create/reactivate the membership.
    // The conditional updateMany is the race guard — of two concurrent accepts, only one
    // sees count === 1; the other rolls back with 409 (SRS AC02: exactly one membership).
    const membership = await prisma.$transaction(async (transaction): Promise<Membership> => {
        const { count } = await transaction.invitation.updateMany({
            where: { id: invitation.id, status: "pending", expiresAt: { gt: new Date() } },
            data: { status: "accepted", respondedAt: new Date() },
        });
        if (count === 0) throw new AppError("This invitation was already used. Look for the workspace in your workspace switcher.", 409);

        const existingMembership = await transaction.membership.findUnique({
            where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: user.id } },
        });
        if (existingMembership?.status === "active") {
            throw new AppError("You're already a member of this workspace", 409);
        }
        // A former member re-joining keeps their history row; it's reactivated with the new role.
        const joinedMembership = existingMembership
            ? await transaction.membership.update({
                where: { id: existingMembership.id },
                data: { status: "active", role: invitation.role, joinedAt: new Date(), removedAt: null },
            })
            : await transaction.membership.create({
                data: { workspaceId: invitation.workspaceId, userId: user.id, role: invitation.role },
            });
        await recordActivity(transaction, {
            workspaceId: invitation.workspaceId,
            actorId: user.id,
            entityType: "membership",
            entityId: joinedMembership.id,
            action: "member.joined",
            changes: { role: { from: null, to: invitation.role } },
            summary: user.name,
        });
        return joinedMembership;
    });

    logger.info(`Invitation accepted invitationId=${invitation.id} userId=${user.id}`);
    res.status(200).json({
        status: "success",
        data: { workspaceId: membership.workspaceId, role: membership.role },
    });
});

export const declineInvitation = catchAsync(async (req, res) => {
    const user = requireUser(req);
    const invitation = await loadInvitationForRecipient(req.body, user.email);

    const { count } = await prisma.invitation.updateMany({
        where: { id: invitation.id, status: "pending" },
        data: { status: "declined", respondedAt: new Date() },
    });
    if (count === 0) throw new AppError("This invitation was already answered or withdrawn.", 409);

    logger.info(`Invitation declined invitationId=${invitation.id} userId=${user.id}`);
    res.status(200).json({ status: "success", message: "Invitation declined" });
});
