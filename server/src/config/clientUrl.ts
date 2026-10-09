// Single source of truth for the frontend origin.
// Used for CORS, the OAuth success/failure redirects *and* every link inside
// outgoing emails, so the three can never drift apart. Override with CLIENT_URL
// in any environment; otherwise fall back per NODE_ENV to match the deployed
// frontend / the local dev port.
// NOTE: FRONTEND_URL is the older name some deployments still set (the emails
// used to read it directly) — kept as a fallback so nothing breaks on upgrade.
const CLIENT_URL =
  process.env.CLIENT_URL ||
  process.env.FRONTEND_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://afritask.jimba.dev"
    : "http://localhost:3001");

export default CLIENT_URL;
