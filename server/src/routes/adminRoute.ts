import express from "express";
import { credentialLimiter } from "../middlewares/rateLimiter.js";
import { requireOperator, requireOperatorSession } from "../middlewares/operatorAuth.middleware.js";
import { operatorLogin, operatorLogout, operatorMe, operatorMfaSetup, operatorMfaVerify } from "../controllers/adminAuth.controller.js";
import {
    getAccount,
    getWorkspace,
    restoreAccount,
    restoreWorkspace,
    searchAccounts,
    searchWorkspaces,
    suspendAccount,
    suspendWorkspace,
} from "../controllers/adminDirectory.controller.js";
import { getOperationsHealth, listAudit, listDeliveries, retryDelivery } from "../controllers/adminOperations.controller.js";
import { createPost, deleteDraft, getPost, getSubscriberSummary, listPosts, publishPost, updatePost } from "../controllers/adminNewsletter.controller.js";
import { getSupportSummary, getTicket, listTickets, replyToTicket, updateTicketStatus } from "../controllers/adminSupport.controller.js";


const router = express.Router();

// ─── Admin console (Platform Superadmin) ─────────────────────
// Separate from every customer route: its own sign-in, session cookie (scoped to /api/admin)
// and MFA. Customer sessions are never accepted here.

// Sign-in steps: password, then MFA. Rate-limited like any credential endpoint.
router.post("/auth/login", credentialLimiter(), operatorLogin);
router.post("/auth/mfa/setup", requireOperatorSession, operatorMfaSetup);
router.post("/auth/mfa/verify", credentialLimiter(), requireOperatorSession, operatorMfaVerify);
router.get("/auth/me", requireOperatorSession, operatorMe);
router.post("/auth/logout", requireOperatorSession, operatorLogout);

// ─── Everything below: a fully signed-in operator (password + MFA) ─────────────────────
// Directory: metadata only, never workspace content (SRS SR16/SR17).
router.get("/accounts", requireOperator, searchAccounts);
router.get("/accounts/:accountId", requireOperator, getAccount);
router.post("/accounts/:accountId/suspend", requireOperator, suspendAccount);
router.post("/accounts/:accountId/restore", requireOperator, restoreAccount);
router.get("/workspaces", requireOperator, searchWorkspaces);
router.get("/workspaces/:workspaceId", requireOperator, getWorkspace);
router.post("/workspaces/:workspaceId/suspend", requireOperator, suspendWorkspace);
router.post("/workspaces/:workspaceId/restore", requireOperator, restoreWorkspace);

// Operations (SRS SR18): health, delivery failures with retry, the audit trail.
router.get("/operations/health", requireOperator, getOperationsHealth);
router.get("/deliveries", requireOperator, listDeliveries);
router.post("/deliveries/:deliveryId/retry", requireOperator, retryDelivery);
router.get("/audit", requireOperator, listAudit);

// Newsletter: drafts, publishing (optionally emailed), subscriber counts — never addresses.
router.get("/newsletter/posts", requireOperator, listPosts);
router.post("/newsletter/posts", requireOperator, createPost);
router.get("/newsletter/posts/:postId", requireOperator, getPost);
router.patch("/newsletter/posts/:postId", requireOperator, updatePost);
router.delete("/newsletter/posts/:postId", requireOperator, deleteDraft);
router.post("/newsletter/posts/:postId/publish", requireOperator, publishPost);
router.get("/newsletter/subscribers/summary", requireOperator, getSubscriberSummary);

// Support tickets: read, reply (as "Afritask support") and change status — all audited.
router.get("/support/summary", requireOperator, getSupportSummary);
router.get("/support/tickets", requireOperator, listTickets);
router.get("/support/tickets/:ticketId", requireOperator, getTicket);
router.post("/support/tickets/:ticketId/messages", requireOperator, replyToTicket);
router.patch("/support/tickets/:ticketId", requireOperator, updateTicketStatus);


export default router;
