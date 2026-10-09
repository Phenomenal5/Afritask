import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import validator from "validator";
import prisma, { type PublicUser } from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import logger, { describeError } from "../utils/logger.js";
import env from "../config/env.js";

// Older tokens were signed with { userId } instead of { id }.
interface AuthTokenPayload extends JwtPayload {
    id?: string;
    userId?: string;
}

const protect = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            logger.warn(`Unauthorized access attempt: missing or invalid auth header`);
            return res.status(401).json({ status: "fail", message: "Unauthorized" });
        }

        const token = authHeader.split(" ")[1] ?? "";
        const decoded = jwt.verify(token, env.jwtSecret) as AuthTokenPayload;
        // Accept the current payload name and older tokens generated with userId.
        const userId = decoded.id || decoded.userId;

        if (!userId) {
            logger.warn(`Unauthorized access attempt: token missing userId`);
            return res.status(401).json({ status: "fail", message: "Unauthorized" });
        }

        // NOTE: tokens issued before the Postgres move carry a Mongo ObjectId, not a
        // UUID. They're still validly signed, so reject them here (forcing a fresh
        // login) instead of letting Postgres throw on the malformed id.
        if (!validator.isUUID(userId)) {
            logger.warn(`Unauthorized access attempt: pre-migration token userId=${userId}`);
            return res.status(401).json({ status: "fail", message: "Unauthorized" });
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            logger.warn(`Unauthorized access attempt: user not found userId=${userId}`);
            return res.status(401).json({ status: "fail", message: "Unauthorized" });
        }

        req.user = user;
        next();
    } catch (error) {
        logger.error(`Authorization failure: ${describeError(error)}`);
        res.status(401).json({ status: "fail", message: "Unauthorized" });
    }
};

// Typed access to the user `protect` attached. Only call this behind `protect`;
// if it ever runs without it, fail loudly as a 401 instead of crashing on undefined.
export const requireUser = (req: Request): PublicUser => {
    if (!req.user) throw new AppError("Unauthorized", 401);
    return req.user;
};

export default protect;
