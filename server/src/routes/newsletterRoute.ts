import express from "express";
import protect from "../middlewares/auth.middleware.js";
import { emailActionLimiter } from "../middlewares/rateLimiter.js";
import {
    confirm,
    getMySubscription,
    getPublishedPost,
    listPublishedPosts,
    subscribe,
    unsubscribeByLink,
    updateMySubscription,
} from "../controllers/newsletter.controller.js";

const router = express.Router();

// ─── Newsletter ─────────────────────
// Public: the published feed, the website form, and the signed links from emails.
router.get("/posts", listPublishedPosts);
router.get("/posts/:postId", getPublishedPost);
// Sends an email, so it's rate-limited like other email actions.
router.post("/subscribe", emailActionLimiter(), subscribe);
router.post("/confirm", confirm);
// NOTE: exempt from the CSRF header check (see csrf.middleware.ts) — mail apps POST it directly.
router.post("/unsubscribe", unsubscribeByLink);

// Signed in: the settings toggle.
router.get("/subscription", protect, getMySubscription);
router.put("/subscription", protect, updateMySubscription);

export default router;
