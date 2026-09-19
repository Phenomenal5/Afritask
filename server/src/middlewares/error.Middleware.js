import AppError from "../utils/AppError.js";
import logger from "../utils/logger.js";

const handleDuplicateFields = (error) => {
  const field = Object.keys(error.keyValue)[0];
  return new AppError(`${field} already exists`, 400);
};

const handleValidationError = (error) => {
  const message = Object.values(error.errors)
    .map((item) => item.message)
    .join(". ");

  return new AppError(message, 400);
};

const handleCastError = () => new AppError("Invalid id format", 400);

const handleJwtError = () => new AppError("Invalid token. Please log in again", 401);

const handleJwtExpiredError = () =>
  new AppError("Your token has expired. Please log in again", 401);

const globalErrorHandler = (error, req, res, next) => {
  let err = { ...error, message: error.message };
  logger.error(error.stack || error.message || error);
  if (error.code === 11000) err = handleDuplicateFields(error);
  if (error.name === "ValidationError") err = handleValidationError(error);
  if (error.name === "CastError") err = handleCastError();
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
