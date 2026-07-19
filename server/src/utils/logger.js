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
    format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:MM:ss" }),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, stack }) => {
            return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`;
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

if (process.env.NODE_ENV !== "production") {
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