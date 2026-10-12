// Single source of truth for the frontend origin.
// Used for CORS, the OAuth success/failure redirects *and* every link inside
// outgoing emails, so the three can never drift apart.
// NOTE: it comes only from CLIENT_URL (required, checked in config/env.ts). The old
// fallbacks (FRONTEND_URL, a hardcoded production domain) are gone: a wrong guess sent
// people to the wrong site from emails and OAuth.
import env from "./env.js";

const CLIENT_URL = env.clientUrl;

export default CLIENT_URL;
