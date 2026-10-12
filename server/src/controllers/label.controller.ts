import validator from "validator";
import prisma from "../config/prisma.js";
import type { Membership } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger from "../utils/logger.js";
import routeParam from "../utils/routeParam.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { notFoundUnlessSuspended, requireActiveMembership, requireMembership } from "../middlewares/workspaceAccess.middleware.js";

// ─── Labels (PRD FR07) ─────────────────────
// Workspace-scoped. Every member can see them; Owners/Admins create, rename and delete.
// Applying a label to a task is part of editing the task (see task.controller.ts).

const LABEL_NAME_MAX_LENGTH = 40;
export const LABEL_COLORS = ["gray", "moss", "clay", "gold", "sky", "plum"] as const;

const labelSelect = { id: true, name: true, color: true } as const;

const isManager = (membership: Membership) => membership.role === "owner" || membership.role === "admin";

const parseLabelName = (name: unknown): string => {
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) throw new AppError("Give the label a name.", 400);
    if (trimmedName.length > LABEL_NAME_MAX_LENGTH) throw new AppError(`Keep the label name to ${LABEL_NAME_MAX_LENGTH} characters or fewer.`, 400);
    return trimmedName;
};

const parseLabelColor = (color: unknown): string | undefined => {
    if (color === undefined) return undefined;
    if (!LABEL_COLORS.includes(color as (typeof LABEL_COLORS)[number])) {
        throw new AppError("Choose a colour from the list.", 400);
    }
    return color as string;
};

// "Bug" and "bug" are the same label to a person — refuse the near-duplicate.
const assertNameAvailable = async (workspaceId: string, name: string, exceptLabelId?: string) => {
    const clash = await prisma.label.findFirst({
        where: { workspaceId, name: { equals: name, mode: "insensitive" }, ...(exceptLabelId && { id: { not: exceptLabelId } }) },
        select: { id: true },
    });
    if (clash) throw new AppError("A label with that name already exists", 409);
};

// Item routes carry no workspace id: access comes from the label's workspace (404 for outsiders).
const loadLabelForManager = async (labelId: string | undefined, userId: string) => {
    if (!labelId || !validator.isUUID(labelId)) throw new AppError("That label was deleted. Refresh to see the latest.", 404);
    const label = await prisma.label.findUnique({ where: { id: labelId } });
    if (!label) throw new AppError("That label was deleted. Refresh to see the latest.", 404);
    const membership = await requireActiveMembership(label.workspaceId, userId).catch(notFoundUnlessSuspended("That label was deleted. Refresh to see the latest."));
    if (!isManager(membership)) throw new AppError("Only Owners and Admins can manage labels", 403);
    return label;
};

// ─── /api/workspaces/:workspaceId/labels ─────────────────────

export const listLabels = catchAsync(async (req, res) => {
    const membership = requireMembership(req);
    const labels = await prisma.label.findMany({
        where: { workspaceId: membership.workspaceId },
        orderBy: { name: "asc" },
        select: { ...labelSelect, _count: { select: { tasks: true } } },
    });
    res.status(200).json({
        status: "success",
        results: labels.length,
        data: { labels: labels.map(({ _count, ...label }) => ({ ...label, taskCount: _count.tasks })) },
    });
});

export const createLabel = catchAsync(async (req, res) => {
    const membership = requireMembership(req);
    const name = parseLabelName(req.body.name);
    await assertNameAvailable(membership.workspaceId, name);

    const label = await prisma.label.create({
        data: { workspaceId: membership.workspaceId, name, color: parseLabelColor(req.body.color) },
        select: labelSelect,
    });

    logger.info(`Label created labelId=${label.id} workspaceId=${membership.workspaceId}`);
    res.status(201).json({ status: "success", data: { label } });
});

// ─── /api/labels/:labelId ─────────────────────

export const updateLabel = catchAsync(async (req, res) => {
    const existing = await loadLabelForManager(routeParam(req, "labelId"), requireUser(req).id);
    const name = req.body.name === undefined ? undefined : parseLabelName(req.body.name);
    if (name) await assertNameAvailable(existing.workspaceId, name, existing.id);

    const label = await prisma.label.update({
        where: { id: existing.id },
        data: { name, color: parseLabelColor(req.body.color) },
        select: labelSelect,
    });

    res.status(200).json({ status: "success", data: { label } });
});

// Deleting a label only removes its links to tasks (cascade on TaskLabel), never tasks.
export const deleteLabel = catchAsync(async (req, res) => {
    const label = await loadLabelForManager(routeParam(req, "labelId"), requireUser(req).id);
    await prisma.label.delete({ where: { id: label.id } });

    logger.info(`Label deleted labelId=${label.id}`);
    res.status(204).json({ status: "success", data: null });
});
