import type { NextFunction, Request, Response } from "express";
import validator from "validator";
import prisma from "../config/prisma.js";
import type { Membership, WorkspaceRole } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import routeParam from "../utils/routeParam.js";
import { requireUser } from "./auth.middleware.js";

// ─── Workspace isolation ─────────────────────
// Every workspace-owned request goes through an ACTIVE membership check here, on the
// server, for every request — the client's "selected workspace" is never trusted.
// NOTE: a non-member gets the same 404 as a missing workspace, so guessed ids
// reveal nothing about which workspaces exist (SRS AC03).

export const findActiveMembership = (workspaceId: string, userId: string) =>
    prisma.membership.findFirst({ where: { workspaceId, userId, status: "active" } });

// Membership for a workspace id, or a 404 AppError.
export const requireActiveMembership = async (workspaceId: string | undefined, userId: string): Promise<Membership> => {
    if (!workspaceId || !validator.isUUID(workspaceId)) throw new AppError("Workspace not found", 404);
    const membership = await findActiveMembership(workspaceId, userId);
    if (!membership) throw new AppError("Workspace not found", 404);
    return membership;
};

// For routes with :workspaceId — attaches req.membership. Mount after `protect`.
export const requireWorkspaceMember = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    req.membership = await requireActiveMembership(routeParam(req, "workspaceId"), requireUser(req).id);
    next();
});

// Role gate for workspace routes. NOTE: rest args — requireWorkspaceRole("owner", "admin").
export const requireWorkspaceRole = (...allowedRoles: WorkspaceRole[]) =>
    (req: Request, res: Response, next: NextFunction) => {
        if (!req.membership) return next(new AppError("Workspace not found", 404));
        if (!allowedRoles.includes(req.membership.role)) {
            return next(new AppError("You don't have permission to do that in this workspace", 403));
        }
        next();
    };

// Typed access to the membership `requireWorkspaceMember` attached.
export const requireMembership = (req: Request): Membership => {
    if (!req.membership) throw new AppError("Workspace not found", 404);
    return req.membership;
};
