import type { ErrorRequestHandler } from "express";
import multer from "multer";
import { Prisma } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import logger, { describeError } from "../utils/logger.js";
import { redactUrl } from "./requestId.middleware.js";

// The fields we read off our own AppError (and anything that mimics it).
interface HandledError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
  // AppError's machine-readable reason (Prisma errors also have a `code` — "P2002" etc. —
  // which is never passed through).
  code?: string;
}

// ─── Prisma known request errors (https://pris.ly/d/prisma-errors) ─────────────────────
// Input validation (bad ids, enums, dates) is done in the controllers before Prisma
// runs, so only database-level conflicts are expected to reach here.
const handlePrismaKnownError = (error: Prisma.PrismaClientKnownRequestError) => {
  // P2002: unique constraint, e.g. two signups racing for the same email.
  if (error.code === "P2002") {
    const target = error.meta?.target;
    const field = Array.isArray(target) ? target.join(", ") : "Value";
    return new AppError(`${field} already exists`, 400);
  }
  // P2025: the row an update/delete expected is gone.
  if (error.code === "P2025") return new AppError("Resource not found", 404);
  return null;
};

const globalErrorHandler: ErrorRequestHandler = (error: HandledError, req, res, next) => {
  let handledError: HandledError = { ...error, message: error.message };
  if (error instanceof Prisma.PrismaClientKnownRequestError) handledError = handlePrismaKnownError(error) ?? handledError;
  // Upload limits (e.g. file over 5 MB) are the client's mistake, not a server failure.
  if (error instanceof multer.MulterError) {
    handledError = new AppError(error.code === "LIMIT_FILE_SIZE" ? "Image must be 5 MB or smaller" : `Upload failed: ${error.message}`, 400);
  }
  // A malformed JSON body (express.json) is a 400 too.
  if ((error as { type?: string }).type === "entity.parse.failed") handledError = new AppError("Request body is not valid JSON", 400);
  // NOTE: body-parser's "too large" used to fall through to a generic 500.
  if ((error as { type?: string }).type === "entity.too.large") handledError = new AppError("Request body is too large", 413);

  // NOTE: only our own AppErrors get to choose the status code. Third-party SDK
  // errors carry their own `statusCode` and the spread above copies it straight
  // through — a Brevo "unauthorised IP" rejection therefore answered
  // POST /signup with 401 Unauthorized, which reads to the client as a broken
  // session rather than a failed email. Anything non-operational is a 500.
  const isOperational = Boolean(handledError.isOperational);
  const statusCode = isOperational ? handledError.statusCode || 500 : 500;

  // Expected refusals (4xx) are one-line warnings; real failures get the stack. Both carry
  // the request id and a redacted URL, so a report can be matched to its log entry.
  const where = `requestId=${req.id ?? "-"} ${req.method} ${redactUrl(req.originalUrl)}`;
  if (statusCode >= 500) logger.error(`${where} ${describeError(error)}`);
  else logger.warn(`${where} ${statusCode} ${handledError.message}`);

  res.status(statusCode).json({
    status: isOperational ? handledError.status || "error" : "error",
    message: isOperational ? handledError.message : "Something went wrong on our side. Please try again in a moment.",
    ...(isOperational && typeof handledError.code === "string" && !handledError.code.startsWith("P") && { code: handledError.code }),
    // A reference the person can quote; it points at the log line above. No internals.
    ...(statusCode >= 500 && { requestId: req.id }),
  });
};

export default globalErrorHandler;
