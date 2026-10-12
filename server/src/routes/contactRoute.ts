import express from "express";
import { contactLimiter } from "../middlewares/rateLimiter.js";
import { sendContactMessage } from "../controllers/contact.controller.js";

const router = express.Router();

// ─── Public Contact page (no sign-in) ─────────────────────
router.post("/", contactLimiter(), sendContactMessage);

export default router;
