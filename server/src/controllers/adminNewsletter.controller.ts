import validator from "validator";
import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger from "../utils/logger.js";
import routeParam from "../utils/routeParam.js";
import { requireOperatorContext } from "../middlewares/operatorAuth.middleware.js";
import { recordAdminAudit, requestIp } from "../services/adminAuditService.js";
import { subscriberSummary } from "../services/newsletterService.js";
import { pageOf, parsePaging } from "./adminDirectory.controller.js";

// ─── Newsletter posts (admin console) ─────────────────────
// Operators write drafts, edit them, and publish. Publishing puts the post in the in-app
// News feed and, if asked, emails it to every confirmed subscriber (the minute sweep sends
// it in batches — see services/newsletterService.ts). Every write is audited.

const TITLE_MAX_LENGTH = 150;
const SUMMARY_MAX_LENGTH = 300;
const BODY_MAX_LENGTH = 20_000;

const ADMIN_POST_FIELDS = {
    id: true,
    title: true,
    summary: true,
    body: true,
    status: true,
    publishedAt: true,
    emailRequested: true,
    emailCompletedAt: true,
    createdAt: true,
    updatedAt: true,
    author: { select: { id: true, name: true } },
    _count: { select: { deliveries: { where: { status: "sent" as const } } } },
} as const;

const requirePostId = (postId: string | undefined) => {
    if (!postId || !validator.isUUID(postId)) throw new AppError("Post not found", 404);
    return postId;
};

const textField = (value: unknown, label: string, { required, maxLength }: { required: boolean; maxLength: number }) => {
    if (value === undefined && !required) return undefined;
    if (typeof value !== "string") throw new AppError(`${label} must be text`, 400);
    const trimmed = value.trim();
    if (required && !trimmed) throw new AppError(`${label} can't be empty`, 400);
    if (trimmed.length > maxLength) throw new AppError(`${label} must be ${maxLength} characters or fewer`, 400);
    return trimmed;
};

const loadPost = async (postId: string) => {
    const post = await prisma.newsletterPost.findUnique({ where: { id: postId }, select: ADMIN_POST_FIELDS });
    if (!post) throw new AppError("Post not found", 404);
    return post;
};

// GET /api/v1/admin/newsletter/posts?page=&limit= — drafts and published, newest first.
export const listPosts = catchAsync(async (req, res) => {
    const paging = parsePaging(req.query);
    const [posts, total] = await prisma.$transaction([
        prisma.newsletterPost.findMany({ select: ADMIN_POST_FIELDS, orderBy: { createdAt: "desc" }, skip: paging.skip, take: paging.limit }),
        prisma.newsletterPost.count(),
    ]);
    res.status(200).json({ status: "success", data: pageOf(posts, total, paging) });
});

// GET /api/v1/admin/newsletter/posts/:postId
export const getPost = catchAsync(async (req, res) => {
    const post = await loadPost(requirePostId(routeParam(req, "postId")));
    res.status(200).json({ status: "success", data: { post } });
});

// POST /api/v1/admin/newsletter/posts  { title, summary?, body } — a new draft.
export const createPost = catchAsync(async (req, res) => {
    const { operator } = requireOperatorContext(req);
    const title = textField(req.body?.title, "Title", { required: true, maxLength: TITLE_MAX_LENGTH })!;
    const summary = textField(req.body?.summary ?? "", "Summary", { required: false, maxLength: SUMMARY_MAX_LENGTH })!;
    const body = textField(req.body?.body, "Body", { required: true, maxLength: BODY_MAX_LENGTH })!;

    const postId = await prisma.$transaction(async (tx) => {
        const post = await tx.newsletterPost.create({ data: { title, summary, body, authorId: operator.userId } });
        await recordAdminAudit(tx, { actorId: operator.userId, action: "newsletter.drafted", targetType: "newsletter_post", targetId: post.id, ipAddress: requestIp(req) });
        return post.id;
    });
    res.status(201).json({ status: "success", data: { post: await loadPost(postId) } });
});

// PATCH /api/v1/admin/newsletter/posts/:postId  { title?, summary?, body? }
// NOTE: a published post can be corrected (the feed shows the fix), but it's never
// re-emailed — subscribers already have the version that was sent.
export const updatePost = catchAsync(async (req, res) => {
    const { operator } = requireOperatorContext(req);
    const postId = requirePostId(routeParam(req, "postId"));
    const changes = {
        title: textField(req.body?.title, "Title", { required: false, maxLength: TITLE_MAX_LENGTH }),
        summary: textField(req.body?.summary, "Summary", { required: false, maxLength: SUMMARY_MAX_LENGTH }),
        body: textField(req.body?.body, "Body", { required: false, maxLength: BODY_MAX_LENGTH }),
    };
    if (changes.title === "" || changes.body === "") throw new AppError("Title and body can't be empty", 400);

    await prisma.$transaction(async (tx) => {
        const { count } = await tx.newsletterPost.updateMany({ where: { id: postId }, data: changes });
        if (count === 0) throw new AppError("Post not found", 404);
        await recordAdminAudit(tx, { actorId: operator.userId, action: "newsletter.edited", targetType: "newsletter_post", targetId: postId, ipAddress: requestIp(req) });
    });
    res.status(200).json({ status: "success", data: { post: await loadPost(postId) } });
});

// POST /api/v1/admin/newsletter/posts/:postId/publish  { emailSubscribers: boolean }
export const publishPost = catchAsync(async (req, res) => {
    const { operator } = requireOperatorContext(req);
    const postId = requirePostId(routeParam(req, "postId"));
    const emailSubscribers = req.body?.emailSubscribers;
    if (typeof emailSubscribers !== "boolean") throw new AppError("emailSubscribers must be true or false", 400);

    await prisma.$transaction(async (tx) => {
        // Conditional on still being a draft: publishing twice can't email twice.
        const { count } = await tx.newsletterPost.updateMany({
            where: { id: postId, status: "draft" },
            data: { status: "published", publishedAt: new Date(), emailRequested: emailSubscribers },
        });
        if (count === 0) {
            const exists = await tx.newsletterPost.count({ where: { id: postId } });
            throw exists ? new AppError("This post is already published.", 409) : new AppError("Post not found", 404);
        }
        await recordAdminAudit(tx, {
            actorId: operator.userId,
            action: "newsletter.published",
            targetType: "newsletter_post",
            targetId: postId,
            metadata: { emailSubscribers },
            ipAddress: requestIp(req),
        });
    });

    logger.info(`Newsletter post ${postId} published by operator=${operator.userId} (email=${emailSubscribers})`);
    res.status(200).json({ status: "success", data: { post: await loadPost(postId) } });
});

// DELETE /api/v1/admin/newsletter/posts/:postId — drafts only; published posts stay on record.
export const deleteDraft = catchAsync(async (req, res) => {
    const { operator } = requireOperatorContext(req);
    const postId = requirePostId(routeParam(req, "postId"));

    await prisma.$transaction(async (tx) => {
        const { count } = await tx.newsletterPost.deleteMany({ where: { id: postId, status: "draft" } });
        if (count === 0) {
            const exists = await tx.newsletterPost.count({ where: { id: postId } });
            throw exists ? new AppError("Published posts can't be deleted.", 409) : new AppError("Post not found", 404);
        }
        await recordAdminAudit(tx, { actorId: operator.userId, action: "newsletter.deleted", targetType: "newsletter_post", targetId: postId, ipAddress: requestIp(req) });
    });
    res.status(204).send();
});

// GET /api/v1/admin/newsletter/subscribers/summary — counts only, never the addresses.
export const getSubscriberSummary = catchAsync(async (_req, res) => {
    res.status(200).json({ status: "success", data: { summary: await subscriberSummary() } });
});
