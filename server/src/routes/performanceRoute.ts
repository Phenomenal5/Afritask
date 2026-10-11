import express from "express";
import protect from "../middlewares/auth.middleware.js";
import { createShare, getMyPerformance, listMyShares, revokeShare, viewSharedPerformance } from "../controllers/performance.controller.js";

const router = express.Router();

// ─── Monthly performance summary ─────────────────────
// Public: a shared link (counts only — never task titles).
router.get("/shared/:token", viewSharedPerformance);

// Signed in: your own summary and your share links.
router.get("/", protect, getMyPerformance);
router.get("/shares", protect, listMyShares);
router.post("/shares", protect, createShare);
router.delete("/shares/:shareId", protect, revokeShare);

export default router;
