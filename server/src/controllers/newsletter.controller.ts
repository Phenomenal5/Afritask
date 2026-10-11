import validator from "validator";
import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger from "../utils/logger.js";
import routeParam from "../utils/routeParam.js";
import { verifyLink } from "../utils/signedLink.js";
import { assertValidEmail } from "../utils/userValidation.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { parsePaging, pageOf } from "./adminDirectory.controller.js";
import {
    confirmSubscriber,
    isAccountSubscribed,
    setAccountSubscription,
    subscribeVisitor,
    unsubscribe,
} from "../services/newsletterService.js";

// ─── Newsletter: the public feed, subscribing and opting out ─────────────────────

// What readers see of a post — never the author or emailing state.
export const PUBLIC_POST_FIELDS = { id: true, title: true, summary: true, body: true, publishedAt: true } as const;

const VISITOR_SUBSCRIBE_RESPONSE = "Thanks! Check your inbox and confirm to start receiving the newsletter.";

// GET /api/v1/newsletter/posts?page=&limit= — published posts, newest first (public).
export const listPublishedPosts = catchAsync(async (req, res) => {
    const paging = parsePaging(req.query);
    const where = { status: "published" as const };
    const [posts, total] = await prisma.$transaction([
        prisma.newsletterPost.findMany({ where, select: PUBLIC_POST_FIELDS, orderBy: { publishedAt: "desc" }, skip: paging.skip, take: paging.limit }),
        prisma.newsletterPost.count({ where }),
    ]);
    res.status(200).json({ status: "success", data: pageOf(posts, total, paging) });
});

// GET /api/v1/newsletter/posts/:postId — one published post (public). Drafts are 404.
export const getPublishedPost = catchAsync(async (req, res) => {
    const postId = routeParam(req, "postId");
    const post = postId && validator.isUUID(postId)
        ? await prisma.newsletterPost.findFirst({ where: { id: postId, status: "published" }, select: PUBLIC_POST_FIELDS })
        : null;
    if (!post) throw new AppError("Post not found", 404);
    res.status(200).json({ status: "success", data: { post } });
});

// ─── Signed-in account: the settings toggle ─────────────────────
// GET /api/v1/newsletter/subscription
export const getMySubscription = catchAsync(async (req, res) => {
    const subscribed = await isAccountSubscribed(requireUser(req));
    res.status(200).json({ status: "success", data: { subscribed } });
});

// PUT /api/v1/newsletter/subscription  { subscribed: boolean }
export const updateMySubscription = catchAsync(async (req, res) => {
    const { subscribed } = req.body ?? {};
    if (typeof subscribed !== "boolean") throw new AppError("subscribed must be true or false", 400);
    const user = requireUser(req);
    await setAccountSubscription(user, subscribed);
    logger.info(`Newsletter ${subscribed ? "on" : "off"} for user ${user.id}`);
    res.status(200).json({
        status: "success",
        message: subscribed ? "You're subscribed to the newsletter." : "You've unsubscribed from the newsletter.",
        data: { subscribed },
    });
});

// ─── Visitors and email links ─────────────────────
// POST /api/v1/newsletter/subscribe  { email } — sends a confirmation email (double opt-in).
export const subscribe = catchAsync(async (req, res) => {
    const email = assertValidEmail(req.body?.email);
    await subscribeVisitor(email);
    res.status(200).json({ status: "success", message: VISITOR_SUBSCRIBE_RESPONSE });
});

// POST /api/v1/newsletter/confirm  { subscriber, expires, signature } — from the confirmation email.
export const confirm = catchAsync(async (req, res) => {
    const { subscriber, expires, signature } = req.body ?? {};
    if (!verifyLink("newsletter-confirm", subscriber, signature, expires) || !(await confirmSubscriber(subscriber))) {
        throw new AppError("This confirmation link is invalid or has expired. Subscribe again to get a new one.", 400);
    }
    res.status(200).json({ status: "success", message: "You're subscribed. Welcome aboard!" });
});

// POST /api/v1/newsletter/unsubscribe — from the link in every newsletter email.
// Parameters come in the query string (RFC 8058 one-click: mail apps POST the URL from the
// List-Unsubscribe header as-is) or in a JSON body (our own unsubscribe page).
export const unsubscribeByLink = catchAsync(async (req, res) => {
    const subscriber = req.query.subscriber ?? req.body?.subscriber;
    const signature = req.query.signature ?? req.body?.signature;
    if (!verifyLink("newsletter-unsubscribe", subscriber, signature)) {
        throw new AppError("This unsubscribe link is invalid. You can also turn the newsletter off in Settings → Profile.", 400);
    }
    await unsubscribe(subscriber as string);
    res.status(200).json({ status: "success", message: "You've been unsubscribed. You won't get the newsletter any more." });
});
