import type { NextFunction, Request, Response } from "express";
import type { PlatformGrant } from "../generated/prisma/client.js";
import catchAsync from "../utils/catchAsync.js";
import AppError from "../utils/AppError.js";
import { revokeSession } from "../services/sessionService.js";
import { OPERATOR_COOKIE_NAME, clearOperatorCookie, findOperatorSession } from "../services/operatorSessionService.js";

// ─── Operator access (SRS SR16) ─────────────────────
// Every /api/admin route below sign-in runs through one of these, so the role is enforced
// on the server for every request — never only by hiding things in the console.
// - requireOperatorSession: a live operator session whose grant is still active. MFA may
//   still be pending — used only by the MFA and "who am I" routes.
// - requireOperator: the same, AND MFA completed for this session. Everything else.

const NOT_SIGNED_IN = "Sign in to the admin console to continue.";

type OperatorSession = NonNullable<Awaited<ReturnType<typeof findOperatorSession>>>;

declare module "express-serve-static-core" {
    interface Request {
        operatorSession?: OperatorSession & { user: { platformGrant: PlatformGrant } };
    }
}

const loadOperatorSession = async (req: Request, res: Response) => {
    const rawSecret: unknown = req.cookies?.[OPERATOR_COOKIE_NAME];
    if (typeof rawSecret !== "string" || !rawSecret) throw new AppError(NOT_SIGNED_IN, 401);

    const session = await findOperatorSession(rawSecret);
    if (!session) {
        clearOperatorCookie(res);
        throw new AppError(NOT_SIGNED_IN, 401);
    }
    // NOTE: a revoked grant (or a suspended account, checked in later tasks) ends the session
    // on the very next request — operator access doesn't outlive the decision to remove it.
    const grant = session.user.platformGrant;
    if (!grant || grant.revokedAt) {
        await revokeSession(session.id);
        clearOperatorCookie(res);
        throw new AppError(NOT_SIGNED_IN, 401);
    }
    req.operatorSession = session as OperatorSession & { user: { platformGrant: PlatformGrant } };
    req.operator = { userId: session.user.id, name: session.user.name, email: session.user.email, sessionId: session.id };
};

export const requireOperatorSession = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    await loadOperatorSession(req, res);
    next();
});

export const requireOperator = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    await loadOperatorSession(req, res);
    if (!req.operatorSession?.mfaVerifiedAt) throw new AppError("Enter the code from your authenticator app to continue.", 401);
    next();
});

// Typed access inside handlers mounted behind requireOperator / requireOperatorSession.
export const requireOperatorContext = (req: Request) => {
    if (!req.operator || !req.operatorSession) throw new AppError(NOT_SIGNED_IN, 401);
    return { operator: req.operator, session: req.operatorSession, grant: req.operatorSession.user.platformGrant };
};
