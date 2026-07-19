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

// Sign in an existing user and return the JWT plus user payload.
export const login = (data) => {
  // POST /auth/login expects credentials and returns token + user data.
  return api.post("/auth/login", data);
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

// Fetch the currently authenticated user using the stored JWT.
export const getMe = () => {
  // GET /auth/me returns the logged-in user and a refreshed token when applicable.
  return api.get("/auth/me");
};

// Build the Google OAuth redirect URL used by the sign-in page.
export const googleLoginUrl = () => {
  return `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/auth/google`;
};
