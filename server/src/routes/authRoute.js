import express from "express";
import passport from "passport";
import {
  forgotPassword,
  googleCallback,
  login,
  me,
  resetPassword,
  signup,
  verifyEmail,
  // verifyForgetPasswordEmailToken
} from "../controllers/auth.controller.js";
import protect from "../middlewares/auth.middleware.js";
import CLIENT_URL from "../config/clientUrl.js";


const router = express.Router();

const googleCredentialsReady = (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).json({
      status: "error",
      message: "Google OAuth credentials are not configured"
    });
  }

  next();
};




router.post("/signup", signup);
router.post("/login", login);
router.get("/verify-email/:token", verifyEmail);
router.post("/forgot-password", forgotPassword);
// router.post("/forgot-password/verify-token/:token", verifyForgetPasswordEmailToken);
router.patch("/reset-password/:token", resetPassword);
router.get("/me", protect, me);

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
