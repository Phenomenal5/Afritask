import type { NextFunction, Request, RequestHandler, Response } from "express";

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

// Forwards any rejected promise to the global error handler, so controllers
// can simply throw (or return next(new AppError(...))).
const catchAsync = (handler: AsyncHandler): RequestHandler => (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
}


export default catchAsync
