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

export default api;
