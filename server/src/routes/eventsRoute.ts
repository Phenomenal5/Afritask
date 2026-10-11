import express from "express";
import protect from "../middlewares/auth.middleware.js";
import { openEventStream } from "../services/realtimeService.js";

const router = express.Router();

// Live updates for the signed-in account: one Server-Sent Events stream per tab.
router.get("/", protect, openEventStream);

export default router;
