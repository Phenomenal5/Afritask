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

  const statusCode = err.statusCode || 500;
  const status = err.status || "error";

  res.status(statusCode).json({
    status,
    message: err.isOperational ? err.message : "Something went wrong",
  });
};

export default globalErrorHandler;
