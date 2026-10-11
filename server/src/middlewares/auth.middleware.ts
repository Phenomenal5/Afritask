import type { NextFunction, Request, Response } from "express";
import type { PublicUser } from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import logger, { describeError } from "../utils/logger.js";
import { ACCESS_TOKEN_COOKIE, findSessionForAccessToken } from "../services/sessionService.js";
import { TERMS_REQUIRED_MESSAGE, hasAcceptedCurrentTerms } from "../config/terms.js";

// Reachable before accepting the terms: signing out, /auth/me, accepting itself, and the
// account's own profile and password — refusing the terms mustn't lock anyone out of their account.
const ROUTES_OPEN_BEFORE_TERMS = new Set(["/api/v1/auth", "/api/v1/users"]);

// Authenticates via the httpOnly access-token cookie (see services/sessionService.ts).
// A 401 carries code "access_token_invalid": the client then calls POST /auth/refresh once
// and retries. If the refresh also fails, the session is really over.
const unauthorized = (res: Response) =>
    res.status(401).json({ status: "fail", code: "access_token_invalid", message: "Unauthorized" });

const protect = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const accessToken: unknown = req.cookies?.[ACCESS_TOKEN_COOKIE];
        if (typeof accessToken !== "string" || !accessToken) {
            logger.warn(`Unauthorized access attempt: no access token`);
            return unauthorized(res);
        }

        const session = await findSessionForAccessToken(accessToken);
        if (!session) {
            logger.warn(`Unauthorized access attempt: invalid or expired access token, or its session ended`);
            return unauthorized(res);
        }

        // NOTE: enforced here, not only in the UI — a Google sign-up never sees the signup
        // checkbox, so without this its API would work without ever agreeing.
        if (!hasAcceptedCurrentTerms(session.user) && !ROUTES_OPEN_BEFORE_TERMS.has(req.baseUrl)) {
            return res.status(403).json({ status: "fail", code: "terms_required", message: TERMS_REQUIRED_MESSAGE });
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
