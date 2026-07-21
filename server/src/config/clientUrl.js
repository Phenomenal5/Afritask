// Single source of truth for the frontend origin.
// Used for CORS *and* the OAuth success/failure redirects so the two can never
// drift apart. Override with CLIENT_URL in any environment; otherwise fall back
// per NODE_ENV to match the deployed frontend / the local dev port.
const CLIENT_URL =
  process.env.CLIENT_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://afritask.netlify.app"
    : "http://localhost:3001");

export default CLIENT_URL;
