// ─── The Express app: middleware chain, routes, error handler LAST ─────────────────────
// No side effects beyond building the app — no DB connect, no listen, no background jobs.
// That lives in server.ts, so tests can import this file and drive it with Supertest.
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import passport from "passport";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";
import "./config/passport.js";
import authRoutes from "./routes/authRoute.js";
import userRoute from "./routes/userRoute.js";
import taskRoute from "./routes/taskRoute.js";
import workspaceRoute from "./routes/workspaceRoute.js";
import invitationRoute from "./routes/invitationRoute.js";
import newsletterRoute from "./routes/newsletterRoute.js";
import eventsRoute from "./routes/eventsRoute.js";
import projectRoute from "./routes/projectRoute.js";
import labelRoute from "./routes/labelRoute.js";
import commentRoute from "./routes/commentRoute.js";
import notificationRoute from "./routes/notificationRoute.js";
import assignRequestId, { redactUrl } from "./middlewares/requestId.middleware.js";
import healthRoute from "./routes/healthRoute.js";
import adminRoute from "./routes/adminRoute.js";
import logger from "./utils/logger.js";
import globalErrorHandler from "./middlewares/error.Middleware.js";
import CLIENT_URL from "./config/clientUrl.js";
import env from "./config/env.js";
import requireAjaxHeader from "./middlewares/csrf.middleware.js";
import openApiDocument from "./docs/openapi.js";


const app = express();

// First: every later log line about this request can name it.
app.use(assignRequestId);

// Behind the client's /api rewrite (and the host's load balancer) in production — trust
// exactly that many hops so req.ip is the real client for rate limiting, and nothing more.
if (env.isProduction) app.set("trust proxy", env.trustProxyHops);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Same origin the OAuth flow redirects back to — see config/clientUrl.js.
const corsOptions = {
  origin: CLIENT_URL,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Requested-With'],
  // The browser normally reaches the API same-origin via the client's /api rewrite;
  // this only matters for direct cross-origin calls (e.g. local tools).
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'))
app.use(passport.initialize());
// Request logs are noise in test output; errors still reach the logger.
// NOTE: the URL is redacted (invitation/verification/reset tokens never reach the logs), and
// there's no Referer/User-Agent/IP noise — just what's needed to trace a request.
morgan.token("id", (req) => (req as express.Request).id);
morgan.token("safe-url", (req) => redactUrl((req as express.Request).originalUrl));
if (!env.isTest) {
  app.use(
    morgan("requestId=:id :method :safe-url :status :res[content-length] - :response-time ms", {
      // Health probes run every few seconds; logging each would drown everything else.
      skip: (req) => req.originalUrl.startsWith("/api/health"),
      stream: {
        write: (message) => logger.info(message.trim()),
      },
    })
  );
}

// ─── Health checks: no auth, no CSRF (GET only), no rate limit ─────────────────────
app.use("/api/health", healthRoute);

app.options('{*path}', cors(corsOptions));

// ─── API docs (Swagger UI) ─────────────────────
// Mounted before the CSRF guard: it only serves GET pages/assets. "Try it out" runs on
// the API's own origin, so the session cookie from POST /auth/login is sent along; the
// interceptor adds the X-Requested-With header the CSRF guard requires on writes.
if (env.apiDocsEnabled) {
  app.get("/api/docs.json", (req, res) => res.json(openApiDocument));
  app.use(
    "/api/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: "Afritask API",
      swaggerOptions: {
        persistAuthorization: true,
        withCredentials: true,
        requestInterceptor: (request: { headers: Record<string, string> }) => {
          request.headers["X-Requested-With"] = "XMLHttpRequest";
          return request;
        },
      },
    })
  );
}

// Cookie-authenticated writes must prove they came from our own JS (see middleware).
app.use("/api", requireAjaxHeader);

// ─── Versioned API: /api/v1 ─────────────────────
// Every route the clients call lives under /api/v1. A breaking change ships as /api/v2
// next to it, so old clients keep working while they move over. Health checks and the
// docs UI stay unversioned: they're for infrastructure and people, not API clients.

// NOTE: the Google OAuth redirect URI is registered in Google Cloud Console (and may sit in
// GOOGLE_CALLBACK_URL) as the pre-versioning path. Forward it, query string included, so
// Google sign-in keeps working until that registration is updated to /api/v1/....
app.get("/api/auth/google/callback", (req, res) => {
  const queryStart = req.originalUrl.indexOf("?");
  const queryString = queryStart === -1 ? "" : req.originalUrl.slice(queryStart);
  res.redirect(307, `/api/v1/auth/google/callback${queryString}`);
});

// Routes
// Authentication routes
app.use("/api/v1/auth", authRoutes);

// User routes
app.use("/api/v1/users", userRoute);

// Workspace routes (incl. a workspace's task list/create, invitations, projects, members)
app.use("/api/v1/workspaces", workspaceRoute);

// Single-task routes
app.use("/api/v1/tasks", taskRoute);

// Single-project routes
app.use("/api/v1/projects", projectRoute);

// Single-label routes
app.use("/api/v1/labels", labelRoute);

// Edit/delete one comment (list/create are under /api/tasks/:id/comments).
app.use("/api/v1/comments", commentRoute);

// The signed-in account's in-app notifications.
app.use("/api/v1/notifications", notificationRoute);

// Invitation preview / accept / decline / resend / revoke
app.use("/api/v1/invitations", invitationRoute);

// Newsletter: public feed, subscribe/confirm/unsubscribe, and the settings toggle.
app.use("/api/v1/newsletter", newsletterRoute);

// Live updates (Server-Sent Events): new notifications and comment changes, ids only.
app.use("/api/v1/events", eventsRoute);

// Admin console (Platform Superadmin): own sign-in, session and MFA.
app.use("/api/v1/admin", adminRoute);


// Anything else under /api: a JSON 404 (not Express's HTML page), pointing old,
// unversioned paths at /api/v1.
app.use("/api", (req, res) => {
  const unversioned = !/^\/v\d+\//.test(req.path);
  res.status(404).json({
    status: "fail",
    message: unversioned ? `Not found. The API is versioned — use /api/v1${req.path}` : "Not found",
  });
});

app.use(globalErrorHandler);


export default app;
