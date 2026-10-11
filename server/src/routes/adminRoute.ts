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


export default router;
