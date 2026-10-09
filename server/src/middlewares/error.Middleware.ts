import type { ErrorRequestHandler } from "express";
import { Prisma } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import logger, { describeError } from "../utils/logger.js";

// The union of fields we read off errors from JWT and our own AppError.
interface HandledError extends Error {
  statusCode?: number;
  status?: string;
  isOperational?: boolean;
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

const handleJwtError = () => new AppError("Invalid token. Please log in again", 401);

const handleJwtExpiredError = () =>
  new AppError("Your token has expired. Please log in again", 401);

const globalErrorHandler: ErrorRequestHandler = (error: HandledError, req, res, next) => {
  let err: HandledError = { ...error, message: error.message };
  logger.error(describeError(error));
  if (error instanceof Prisma.PrismaClientKnownRequestError) err = handlePrismaKnownError(error) ?? err;
  if (error.name === "JsonWebTokenError") err = handleJwtError();
  if (error.name === "TokenExpiredError") err = handleJwtExpiredError();

  // NOTE: only our own AppErrors get to choose the status code. Third-party SDK
  // errors carry their own `statusCode` and the spread above copies it straight
  // through — a Brevo "unauthorised IP" rejection therefore answered
  // POST /signup with 401 Unauthorized, which reads to the client as a broken
  // session rather than a failed email. Anything non-operational is a 500.
  const isOperational = Boolean(err.isOperational);
  const statusCode = isOperational ? err.statusCode || 500 : 500;

  res.status(statusCode).json({
    status: isOperational ? err.status || "error" : "error",
    message: isOperational ? err.message : "Something went wrong",
  });
};

export default globalErrorHandler;
