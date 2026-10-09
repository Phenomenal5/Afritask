import type { NextFunction, Request, Response } from "express";
import type { PublicUser } from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import logger, { describeError } from "../utils/logger.js";
import { SESSION_COOKIE_NAME, clearSessionCookie, findActiveSession } from "../services/sessionService.js";

// Authenticates via the httpOnly session cookie (see services/sessionService.ts).
// NOTE: the old `Authorization: Bearer <jwt>` header is no longer accepted — every
// pre-sessions login was effectively signed out by this change.
const protect = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const rawSecret: unknown = req.cookies?.[SESSION_COOKIE_NAME];
        if (typeof rawSecret !== "string" || !rawSecret) {
            logger.warn(`Unauthorized access attempt: no session cookie`);
            return res.status(401).json({ status: "fail", message: "Unauthorized" });
        }

        const session = await findActiveSession(rawSecret);
        if (!session) {
            // Expired or revoked — drop the dead cookie so the browser stops sending it.
            clearSessionCookie(res);
            logger.warn(`Unauthorized access attempt: unknown, expired or revoked session`);
            return res.status(401).json({ status: "fail", message: "Unauthorized" });
        }

        req.user = session.user;
        req.sessionId = session.id;
        next();
    } catch (error) {
        // NOTE: with database sessions, an exception here is an infrastructure failure
        // (e.g. a dropped DB connection), not a bad credential. Answering 401 made the
        // client treat a hiccup as "signed out" — let it be a 500 instead.
        logger.error(`Authorization lookup failed: ${describeError(error)}`);
        next(error);
    }
};

// Typed access to the user `protect` attached. Only call this behind `protect`;
// if it ever runs without it, fail loudly as a 401 instead of crashing on undefined.
export const requireUser = (req: Request): PublicUser => {
    if (!req.user) throw new AppError("Unauthorized", 401);
    return req.user;
};

export default protect;
