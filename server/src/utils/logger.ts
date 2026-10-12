import winston from "winston";
import path from "path";
import fs from "fs";


// Make sure the logs folder exists before Winston tries to write to it
const logsDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

const logger = winston.createLogger({
    level: "info",
    // Test runs would otherwise print every request's log lines.
    silent: process.env.NODE_ENV === "test" && process.env.LOG_IN_TESTS !== "on",
    format: winston.format.combine(
        // NOTE: "mm" is minutes — this read "HH:MM:ss" (MM = month), so every log line showed
        // the month where the minutes belong.
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.errors({ stack: true }),
        // NOTE: messages can carry client input (an email typed at sign-in). A newline in it
        // would forge a whole log line, so line breaks in the message are written as \n.
        winston.format.printf(({ timestamp, level, message, stack }) => {
            return `[${timestamp}] ${level.toUpperCase()}: ${stack || String(message).replace(/\r?\n|\r/g, "\\n")}`;
        })
    ),
    transports: [
        new winston.transports.File({
            filename: path.join(logsDir, "combined.log"),
        }),

        new winston.transports.File({
            filename: path.join(logsDir, "error.log"),
            level: "error",
        }),
    ],
});

if (process.env.NODE_ENV === "production") {
    // Hosts (Render, Fly, Docker…) collect stdout and usually discard files written inside a
    // container, so production logs go to the console as one JSON object per line — easy to
    // search and alert on. The files above stay as a local fallback.
    logger.add(
        new winston.transports.Console({
            format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), winston.format.json()),
        })
    )
} else {
    logger.add(
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    )
}



export default logger

// catch blocks receive `unknown` — this turns whatever was thrown into a loggable string.
export const describeError = (error: unknown): string =>
    error instanceof Error ? (error.stack ?? error.message) : String(error)

// Message only, for one-line warnings where a full stack would be noise.
export const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)
