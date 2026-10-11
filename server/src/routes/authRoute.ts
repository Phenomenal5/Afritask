import express from "express";
import type { RequestHandler } from "express";
import passport from "passport";
import {
  acceptTerms,
  forgotPassword,
  googleCallback,
  googleExchange,
  login,
  logout,
  me,
  resetPassword,
  signup,
  verifyEmail,
} from "../controllers/auth.controller.js";
import protect from "../middlewares/auth.middleware.js";
import { credentialLimiter, emailActionLimiter } from "../middlewares/rateLimiter.js";
import CLIENT_URL from "../config/clientUrl.js";
import env from "../config/env.js";


const router = express.Router();

const googleCredentialsReady: RequestHandler = (req, res, next) => {
  if (!env.googleClientId || !env.googleClientSecret) {
    return res.status(500).json({
      status: "error",
      message: "Google OAuth credentials are not configured"
    });
  }

  next();
};




router.post("/signup", emailActionLimiter(), signup);
router.post("/login", credentialLimiter(), login);
router.post("/logout", protect, logout);
router.get("/verify-email/:token", credentialLimiter(), verifyEmail);
router.post("/forgot-password", emailActionLimiter(), forgotPassword);
router.patch("/reset-password/:token", credentialLimiter(), resetPassword);
router.get("/me", protect, me);
router.post("/accept-terms", protect, acceptTerms);
// Second half of Google sign-in — see googleCallback in auth.controller.ts.
router.post("/google/exchange", credentialLimiter(), googleExchange);

// Start Google OAuth login.
router.get(
  "/google",
  googleCredentialsReady,
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

// Google redirects here after login; Passport attaches the user to req.user.
// On failure (denied consent, no email, etc.) Passport redirects the browser
// straight back to the frontend login with an error flag — never to a JSON
// endpoint on the API domain, which the user would be stranded on.
router.get(
  "/google/callback",
  googleCredentialsReady,
  passport.authenticate("google", {
    session: false,
    failureRedirect: `${CLIENT_URL}/login?error=google`
  }),
  googleCallback
);




export default router;
