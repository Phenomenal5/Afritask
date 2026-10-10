import express from "express";
import { credentialLimiter } from "../middlewares/rateLimiter.js";
import { requireOperatorSession } from "../middlewares/operatorAuth.middleware.js";
import { operatorLogin, operatorLogout, operatorMe, operatorMfaSetup, operatorMfaVerify } from "../controllers/adminAuth.controller.js";


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


export default router;
