/**
 * Auth service wrappers for the backend auth routes.
 * This keeps auth-related API calls centralized and easy to reuse from contexts.
 */
import api from "@/lib/api";

// Create a new account and return the backend signup response.
export const signup = (data) => {
  // POST /auth/signup expects the full signup payload and returns the created auth response.
  return api.post("/auth/signup", data);
};

// Verify an email token and return the backend verification response.
export const verifyEmail = (token) => {
  // GET /auth/verify-email/:token confirms email ownership and returns the auth result.
  return api.get(`/auth/verify-email/${token}`);
};

// Sign in an existing user. The server sets the httpOnly session cookie.
export const login = (data) => {
  // POST /auth/login expects credentials and returns the user.
  return api.post("/auth/login", data);
};

// End the current session (the server revokes it and clears the cookie).
export const logout = () => {
  return api.post("/auth/logout");
};

// Trade the one-time code from the Google redirect for a session cookie.
export const exchangeGoogleCode = (code) => {
  return api.post("/auth/google/exchange", { code });
};

// Request a password reset email for the provided account email.
export const forgotPassword = (email) => {
  // POST /auth/forgot-password expects an email object and returns the request status.
  return api.post("/auth/forgot-password", { email });
};

// Reset a password using the token from the email link.
export const resetPassword = ({ token, password }) => {
  // PATCH /auth/reset-password/:token expects the new password and returns the reset result.
  return api.patch(`/auth/reset-password/${token}`, { password });
};

// Fetch the currently authenticated user from the session cookie (401 when signed out).
export const getMe = () => {
  return api.get("/auth/me");
};

// Google OAuth entry point — a full-page navigation through the /api rewrite.
export const googleLoginUrl = () => "/api/auth/google";
