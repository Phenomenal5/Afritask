import express from "express";
import protect from "../middlewares/auth.middleware.js";
import { supportTicketLimiter } from "../middlewares/rateLimiter.js";
import { createTicket, getMyTicket, listMyTickets, replyToMyTicket, resolveMyTicket } from "../controllers/support.controller.js";

const router = express.Router();

// ─── Support tickets (the signed-in customer's own) ─────────────────────
router.use(protect);
router.get("/tickets", listMyTickets);
router.post("/tickets", supportTicketLimiter(), createTicket);
router.get("/tickets/:ticketId", getMyTicket);
router.post("/tickets/:ticketId/messages", replyToMyTicket);
router.post("/tickets/:ticketId/resolve", resolveMyTicket);

export default router;
