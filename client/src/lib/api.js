// Shared axios client for every backend request.
import axios from "axios";

// Relative on purpose: next.config.mjs rewrites /api to the backend, so requests are
// same-origin and the browser attaches the httpOnly token cookies automatically:
// a 15-minute access token on every request, and a 30-day refresh token that only goes
// to /api/auth. JavaScript can't read either — nothing is kept in localStorage.
const api = axios.create({
  baseURL: "/api",
  headers: {
    "Content-Type": "application/json",
    // NOTE: required on every write — the server's CSRF guard rejects cookie-authenticated
    // POST/PUT/PATCH/DELETE without it (a cross-site form can't set custom headers).
    "X-Requested-With": "XMLHttpRequest",
  },
});

// ─── Access-token refresh ─────────────────────
// A 401 with code "access_token_invalid" usually just means the 15-minute access token
// expired: refresh it once and replay the request, invisibly to the page.
// NOTE: one refresh at a time — when several requests fail together they all wait for the
// same refresh. Firing one each would rotate the refresh token under the others' feet.
let refreshInFlight = null;
const refreshAccessToken = () => {
  refreshInFlight ??= api.post("/auth/refresh").finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
};

// ─── Session expiry ─────────────────────
// A 401 that survives the refresh means the session really ended (signed out, password
// reset, sign-out elsewhere, 30 days up). AuthContext listens for this event and sends the
// user to sign in, keeping where they were.
// NOTE: some 401s are NOT expiry and must be left to the form that asked:
//  - /auth/* — a wrong password on /auth/login, the signed-out probe on /auth/me;
//  - /users/password — "Current password is incorrect" is answered with 401.
export const SESSION_EXPIRED_EVENT = "afritask:session-expired";

// The terms changed (or were never accepted) while signed in — AuthContext shows the
// accept-terms step. The server answers every app request with 403 terms_required until then.
export const TERMS_REQUIRED_EVENT = "afritask:terms-required";

const isCredentialCheck = (requestUrl) => requestUrl.startsWith("/auth/") || requestUrl === "/users/password";

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const requestUrl = originalRequest?.url || "";
    if (
      error.response?.status === 401 &&
      error.response.data?.code === "access_token_invalid" &&
      originalRequest &&
      !originalRequest.retriedAfterRefresh
    ) {
      originalRequest.retriedAfterRefresh = true;
      try {
        await refreshAccessToken();
        return api(originalRequest);
      } catch {
        // Refresh refused — fall through and treat it as a real 401.
      }
    }
    if (error.response?.status === 401 && !isCredentialCheck(requestUrl) && typeof window !== "undefined") {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    if (error.response?.status === 403 && error.response.data?.code === "terms_required" && typeof window !== "undefined") {
      window.dispatchEvent(new Event(TERMS_REQUIRED_EVENT));
    }
    return Promise.reject(error);
  }
);

export default api;
