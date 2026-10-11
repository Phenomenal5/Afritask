import validator from "validator";
import prisma from "../config/prisma.js";
import type { Membership, Prisma } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger from "../utils/logger.js";
import routeParam from "../utils/routeParam.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { notFoundUnlessSuspended, requireActiveMembership } from "../middlewares/workspaceAccess.middleware.js";
import { loadTaskForMember } from "./task.controller.js";
import { notifyMentions } from "../services/notificationService.js";

// ─── Comments and mentions (SRS SR08) ─────────────────────
// - Any active member comments on work that isn't in an archived project.
// - Authors edit their own comments (an "edited" marker shows); nobody edits someone else's.
// - Authors delete their own; Owners/Admins may delete anyone's, with attribution kept.
// - Mentions name active members of the task's workspace by MEMBERSHIP id; the client
//   sends them alongside the text, so a display name can never resolve to the wrong person.

const BODY_MAX_LENGTH = 5_000;
const MAX_MENTIONS = 50;

const isManager = (membership: Membership) => membership.role === "owner" || membership.role === "admin";

const parseBody = (body: unknown): string => {
    const trimmedBody = typeof body === "string" ? body.trim() : "";
    if (!trimmedBody) throw new AppError("Please write a comment", 400);
    if (trimmedBody.length > BODY_MAX_LENGTH) throw new AppError(`Comments must be ${BODY_MAX_LENGTH.toLocaleString("en")} characters or fewer`, 400);
    return trimmedBody;
};

// Every mentioned id must be an ACTIVE membership of this workspace. Duplicates collapse,
// so "@Ada … @Ada" is one mention (SRS SR08 acceptance). undefined = leave unchanged on edit.
const parseMentionIds = async (mentionMembershipIds: unknown, workspaceId: string): Promise<string[] | undefined> => {
    if (mentionMembershipIds === undefined) return undefined;
    if (!Array.isArray(mentionMembershipIds)
        || !mentionMembershipIds.every((membershipId) => typeof membershipId === "string" && validator.isUUID(membershipId))) {
        throw new AppError("mentionMembershipIds must be a list of member ids", 400);
    }
    const uniqueIds = [...new Set(mentionMembershipIds as string[])];
    if (uniqueIds.length > MAX_MENTIONS) throw new AppError(`A comment can mention at most ${MAX_MENTIONS} people`, 400);
    const found = await prisma.membership.count({ where: { id: { in: uniqueIds }, workspaceId, status: "active" } });
    if (found !== uniqueIds.length) throw new AppError("You can only mention current members of this workspace", 400);
    return uniqueIds;
};

// NOTE: archived projects are read-only, comments included (SRS §2 "archived resources").
const assertTaskOpenForDiscussion = async (projectId: string | null) => {
    if (!projectId) return;
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { state: true } });
    if (project?.state === "archived") {
        throw new AppError("This task's project is archived. Restore the project to comment.", 409);
    }
};

const commentInclude = {
    author: { select: { id: true, name: true, photo: true } },
    deletedBy: { select: { id: true, name: true } },
    mentions: {
        select: { membership: { select: { id: true, user: { select: { id: true, name: true } } } } },
        orderBy: { createdAt: "asc" },
    },
} as const satisfies Prisma.CommentInclude;

type CommentRow = Prisma.CommentGetPayload<{ include: typeof commentInclude }>;

// API shape. A deleted comment keeps its place and who deleted it, but never its text.
// canEdit/canDelete tell the client which controls to show (the server re-checks anyway).
const toCommentResponse = (comment: CommentRow, viewer: Membership) => {
    const isDeleted = comment.deletedAt !== null;
    const isAuthor = comment.authorId === viewer.userId;
    return {
        id: comment.id,
        taskId: comment.taskId,
        body: isDeleted ? "" : comment.body,
        author: comment.author,
        createdAt: comment.createdAt,
        editedAt: comment.editedAt,
        deletedAt: comment.deletedAt,
        deletedBy: comment.deletedBy,
        mentions: isDeleted ? [] : comment.mentions.map(({ membership }) => ({ membershipId: membership.id, userId: membership.user.id, name: membership.user.name })),
        canEdit: !isDeleted && isAuthor,
        canDelete: !isDeleted && (isAuthor || isManager(viewer)),
    };
};

// Item routes carry only the comment id: derive access from its task's workspace.
// Missing, deleted-task and "not your workspace" all answer the same 404.
const loadCommentForMember = async (commentId: string | undefined, userId: string) => {
    if (!commentId || !validator.isUUID(commentId)) throw new AppError("Comment not found", 404);
    const comment = await prisma.comment.findUnique({
        where: { id: commentId },
        include: { task: { select: { projectId: true, title: true } }, mentions: { select: { membershipId: true } } },
    });
    if (!comment) throw new AppError("Comment not found", 404);
    const membership = await requireActiveMembership(comment.workspaceId, userId).catch(notFoundUnlessSuspended("Comment not found"));
    return { comment, membership };
};

const assertValidTaskId = (taskId: string | undefined): string => {
    if (!taskId || !validator.isUUID(taskId)) throw new AppError("Invalid id format", 400);
    return taskId;
};

// ─── GET /api/tasks/:id/comments ─────────────────────
export const listTaskComments = catchAsync(async (req, res) => {
    const taskId = assertValidTaskId(routeParam(req, "id"));
    const { task, membership } = await loadTaskForMember(taskId, requireUser(req).id);

    const comments = await prisma.comment.findMany({
        where: { taskId: task.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        include: commentInclude,
    });

    res.status(200).json({ status: "success", results: comments.length, data: { comments: comments.map((comment) => toCommentResponse(comment, membership)) } });
});

// ─── POST /api/tasks/:id/comments ─────────────────────
export const createComment = catchAsync(async (req, res) => {
    const taskId = assertValidTaskId(routeParam(req, "id"));
    const { task, membership } = await loadTaskForMember(taskId, requireUser(req).id);
    await assertTaskOpenForDiscussion(task.projectId);

    const body = parseBody(req.body.body);
    const mentionIds = (await parseMentionIds(req.body.mentionMembershipIds, task.workspaceId)) ?? [];

    const comment = await prisma.$transaction(async (tx) => {
        const createdComment = await tx.comment.create({
            data: {
                taskId: task.id,
                workspaceId: task.workspaceId,
                authorId: membership.userId,
                body,
                mentions: { create: mentionIds.map((membershipId) => ({ membershipId })) },
            },
            include: commentInclude,
        });
        await notifyMentions(tx, createdComment, task.title, mentionIds, membership.userId, "created");
        return createdComment;
    });

    logger.info(`Comment created commentId=${comment.id} taskId=${task.id} userId=${membership.userId} mentions=${mentionIds.length}`);
    res.status(201).json({ status: "success", data: { comment: toCommentResponse(comment, membership) } });
});

// ─── PATCH /api/comments/:commentId ─────────────────────
// Author only. Sending mentionMembershipIds replaces the set; leaving it out keeps it.
export const editComment = catchAsync(async (req, res) => {
    const { comment, membership } = await loadCommentForMember(routeParam(req, "commentId"), requireUser(req).id);
    if (comment.deletedAt) throw new AppError("This comment was deleted", 409);
    if (comment.authorId !== membership.userId) throw new AppError("You can only edit your own comments", 403);
    await assertTaskOpenForDiscussion(comment.task.projectId);

    const body = parseBody(req.body.body);
    const mentionIds = await parseMentionIds(req.body.mentionMembershipIds, comment.workspaceId);

    const updated = await prisma.$transaction(async (tx) => {
        if (mentionIds) {
            await tx.commentMention.deleteMany({ where: { commentId: comment.id, membershipId: { notIn: mentionIds } } });
            await tx.commentMention.createMany({
                data: mentionIds.map((membershipId) => ({ commentId: comment.id, membershipId })),
                skipDuplicates: true,
            });
        }
        // Only a real text change counts as an edit (no "edited" marker for a no-op save).
        const updatedComment = await tx.comment.update({
            where: { id: comment.id },
            data: body !== comment.body ? { body, editedAt: new Date() } : {},
            include: commentInclude,
        });
        // SRS SR08: only people who weren't already mentioned hear about this edit.
        if (mentionIds) {
            const previouslyMentioned = new Set(comment.mentions.map((mention) => mention.membershipId));
            const newlyMentioned = mentionIds.filter((membershipId) => !previouslyMentioned.has(membershipId));
            await notifyMentions(tx, updatedComment, comment.task.title, newlyMentioned, membership.userId, `edit-${updatedComment.updatedAt.getTime()}`);
        }
        return updatedComment;
    });

    logger.info(`Comment edited commentId=${comment.id} userId=${membership.userId}`);
    res.status(200).json({ status: "success", data: { comment: toCommentResponse(updated, membership) } });
});

// ─── DELETE /api/comments/:commentId ─────────────────────
// Author, or an Owner/Admin moderating. Soft delete: text and mentions go, the
// "deleted by" attribution stays in the thread.
export const deleteComment = catchAsync(async (req, res) => {
    const { comment, membership } = await loadCommentForMember(routeParam(req, "commentId"), requireUser(req).id);
    if (comment.deletedAt) throw new AppError("This comment was already deleted", 409);
    if (comment.authorId !== membership.userId && !isManager(membership)) {
        throw new AppError("You can only delete your own comments", 403);
    }
    await assertTaskOpenForDiscussion(comment.task.projectId);

    const deleted = await prisma.$transaction(async (tx) => {
        await tx.commentMention.deleteMany({ where: { commentId: comment.id } });
        return tx.comment.update({
            where: { id: comment.id },
            data: { body: "", deletedAt: new Date(), deletedById: membership.userId },
            include: commentInclude,
        });
    });

    logger.info(`Comment deleted commentId=${comment.id} by userId=${membership.userId}`);
    res.status(200).json({ status: "success", data: { comment: toCommentResponse(deleted, membership) } });
});
