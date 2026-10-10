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
import projectRoute from "./routes/projectRoute.js";
import labelRoute from "./routes/labelRoute.js";
import commentRoute from "./routes/commentRoute.js";
import logger from "./utils/logger.js";
import globalErrorHandler from "./middlewares/error.Middleware.js";
import CLIENT_URL from "./config/clientUrl.js";
import env from "./config/env.js";
import requireAjaxHeader from "./middlewares/csrf.middleware.js";
import openApiDocument from "./docs/openapi.js";


const app = express();

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
if (!env.isTest) {
  app.use(
    morgan("combined", {
      stream: {
        write: (message) => logger.info(message.trim()),
      },
    })
  );
}

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
// Routes
// Authentication routes
app.use("/api/auth", authRoutes);

// User routes
app.use("/api/users", userRoute);

// Workspace routes (incl. a workspace's task list/create, invitations, projects, members)
app.use("/api/workspaces", workspaceRoute);

// Single-task routes
app.use("/api/tasks", taskRoute);

// Single-project routes
app.use("/api/projects", projectRoute);

// Single-label routes
app.use("/api/labels", labelRoute);

// Edit/delete one comment (list/create are under /api/tasks/:id/comments).
app.use("/api/comments", commentRoute);

// Invitation preview / accept / decline / resend / revoke
app.use("/api/invitations", invitationRoute);


app.use(globalErrorHandler);


export default app;
