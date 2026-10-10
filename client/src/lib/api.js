// Shared axios client for every backend request.
import axios from "axios";

// Relative on purpose: next.config.mjs rewrites /api to the backend, so requests are
// same-origin and the browser attaches the httpOnly session cookie automatically.
// There is no token for JavaScript to store or attach any more.
const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
    // NOTE: required on every write — the server's CSRF guard rejects cookie-authenticated
    // POST/PUT/PATCH/DELETE without it (a cross-site form can't set custom headers).
    "X-Requested-With": "XMLHttpRequest",
  },
});

// ─── Session expiry ─────────────────────
// A 401 from any signed-in request means the session cookie expired or was revoked
// (password reset, sign-out elsewhere). AuthContext listens for this event and sends the
// user to sign in, keeping where they were.
// NOTE: some 401s are NOT expiry and must be left to the form that asked:
//  - /auth/* — a wrong password on /auth/login, the signed-out probe on /auth/me;
//  - /users/password — "Current password is incorrect" is answered with 401.
export const SESSION_EXPIRED_EVENT = "afritask:session-expired";

const isCredentialCheck = (requestUrl) => requestUrl.startsWith("/auth/") || requestUrl === "/users/password";

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || "";
    if (error.response?.status === 401 && !isCredentialCheck(requestUrl) && typeof window !== "undefined") {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  }
);

export default api;
