import express from "express";
import protect from "../middlewares/auth.middleware.js";
import { credentialLimiter, invitationLimiter } from "../middlewares/rateLimiter.js";
import {
    acceptInvitation,
    declineInvitation,
    listMyInvitations,
    previewInvitation,
    resendInvitation,
    revokeInvitation,
} from "../controllers/invitation.controller.js";


const router = express.Router();

// Public — the emailed link must work before the recipient has an account (PRD J3).
// Rate-limited so the token space can't be probed.
router.get("/preview/:token", credentialLimiter(), previewInvitation);

// Recipient actions (signed in as the invited email).
router.get("/mine", protect, listMyInvitations);
router.post("/accept", protect, acceptInvitation);
router.post("/decline", protect, declineInvitation);

// Manager actions — the controller checks the caller manages the invitation's workspace.
router.post("/:invitationId/resend", protect, invitationLimiter(), resendInvitation);
router.post("/:invitationId/revoke", protect, revokeInvitation);


export default router;
