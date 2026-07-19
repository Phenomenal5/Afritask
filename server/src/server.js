import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import passport from "passport";
import "./config/passport.js";
import authRoutes from "./routes/authRoute.js";
import userRoute from "./routes/userRoute.js";
import taskRoute from "./routes/taskRoute.js"
import morgan from "morgan";
import logger from "./utils/logger.js";
import globalErrorHandler from "./middlewares/error.Middleware.js";
import connectDB from "./config/db.js";
import startTaskReminderJob from "./jobs/taskReminder.js";



const app = express();


connectDB();

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? 'https://afritask.netlify.app'
    : 'http://localhost:3001',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json());
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
// Routes
// Authentication routes
app.use("/api/auth", authRoutes);

// User routes
app.use("/api/users", userRoute);


// Task routes
app.use("/api/task", taskRoute);



app.use(globalErrorHandler);


app.listen(process.env.PORT, () => {
  logger.info(`Server is running on port ${process.env.PORT}`);
  startTaskReminderJob();
});
