import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import passport from "passport";
import "./config/passport.js";
import authRoutes from "./routes/authRoute.js";
import userRoute from "./routes/userRoute.js";
import taskRoute from "./routes/taskRoute.js"
import workspaceRoute from "./routes/workspaceRoute.js";
import morgan from "morgan";
import logger from "./utils/logger.js";
import globalErrorHandler from "./middlewares/error.Middleware.js";
import { connectDatabase } from "./config/prisma.js";
import CLIENT_URL from "./config/clientUrl.js";
import startTaskReminderJob from "./jobs/taskReminder.js";
import env from "./config/env.js";
import requireAjaxHeader from "./middlewares/csrf.middleware.js";



const app = express();

// Behind the client's /api rewrite (and the host's load balancer) in production — trust
// exactly that many hops so req.ip is the real client for rate limiting, and nothing more.
if (env.isProduction) app.set("trust proxy", env.trustProxyHops);


connectDatabase();

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
app.use(
  morgan("combined", {
    stream: {
      write: (message) => logger.info(message.trim()),
    },
  })
);

app.options('{*path}', cors(corsOptions));
// Cookie-authenticated writes must prove they came from our own JS (see middleware).
app.use("/api", requireAjaxHeader);
// Routes
// Authentication routes
app.use("/api/auth", authRoutes);

// User routes
app.use("/api/users", userRoute);


// Workspace routes (incl. a workspace's task list/create)
app.use("/api/workspaces", workspaceRoute);

// Single-task routes
app.use("/api/tasks", taskRoute);



app.use(globalErrorHandler);


app.listen(env.port, () => {
  logger.info(`Server is running on port ${env.port}`);
  startTaskReminderJob();
});
