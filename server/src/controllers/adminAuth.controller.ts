import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger from "../utils/logger.js";
import { comparePassword } from "../utils/password.js";
import { decryptSecret, encryptSecret } from "../utils/secretBox.js";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../utils/totp.js";
import { revokeSession } from "../services/sessionService.js";
import { clearOperatorCookie, startOperatorSession } from "../services/operatorSessionService.js";
import { recordAdminAudit, requestIp } from "../services/adminAuditService.js";
import { requireOperatorContext } from "../middlewares/operatorAuth.middleware.js";

// ─── Admin console sign-in: password, then MFA (SRS SR16) ─────────────────────
// 1. POST /api/admin/auth/login        email + password of an account holding an active grant
//                                      → an operator session that can ONLY finish MFA.
// 2. POST /api/admin/auth/mfa/setup    first sign-in only: a new authenticator secret.
// 3. POST /api/admin/auth/mfa/verify   a current 6-digit code → the session is fully signed in.
// NOTE: every login failure gets the same answer, so the endpoint never reveals whether an
// email exists, has a password, or holds operator access.

const LOGIN_FAILED = "Incorrect email or password, or this account can't use the admin console.";

const operatorProfile = (user: { id: string; name: string; email: string }, mfaEnrolled: boolean, mfaVerified: boolean) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: "superadmin" as const,
    mfa: { enrolled: mfaEnrolled, verified: mfaVerified },
});

export const operatorLogin = catchAsync(async (req, res) => {
    const { email, password } = req.body;
    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
        throw new AppError("Please enter your email and password.", 400);
    }

    const user = await prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        omit: { password: false },
        include: { platformGrant: true },
    });
    const passwordMatches = await comparePassword(password, user?.password);
    const grant = user?.platformGrant;
    if (!user || !passwordMatches || !user.isVerified || user.suspendedAt || !grant || grant.revokedAt) {
        logger.warn(`Operator login refused for email=${email}`);
        throw new AppError(LOGIN_FAILED, 401);
    }

    await startOperatorSession(req, res, user.id);
    logger.info(`Operator password step passed userId=${user.id}`);
    res.status(200).json({
        status: "success",
        data: { operator: operatorProfile(user, Boolean(grant.mfaEnabledAt), false), next: grant.mfaEnabledAt ? "mfa_verify" : "mfa_setup" },
    });
});

// First sign-in: create (or replace an unfinished) authenticator secret. Once a code has been
// verified, enrolment is closed — resetting MFA is a deployment-side action (the grant script).
export const operatorMfaSetup = catchAsync(async (req, res) => {
    const { operator, grant } = requireOperatorContext(req);
    if (grant.mfaEnabledAt) throw new AppError("Two-step verification is already set up. Enter a code from your authenticator app.", 409);

    const secret = generateTotpSecret();
    await prisma.platformGrant.update({ where: { id: grant.id }, data: { mfaSecretEncrypted: encryptSecret(secret), mfaLastUsedStep: null } });

    res.status(200).json({
        status: "success",
        data: { secret, otpauthUri: otpauthUri(secret, operator.email) },
    });
});

export const operatorMfaVerify = catchAsync(async (req, res) => {
    const { operator, session, grant } = requireOperatorContext(req);
    if (!grant.mfaSecretEncrypted) throw new AppError("Set up two-step verification first.", 409);

    const step = verifyTotp(decryptSecret(grant.mfaSecretEncrypted), req.body.code);
    if (step === null) throw new AppError("That code didn't match. Check your authenticator app and try the current code.", 401);

    const firstEnrolment = !grant.mfaEnabledAt;
    await prisma.$transaction(async (tx) => {
        // NOTE: conditional on the step being NEW — a code that was already used (even in a
        // racing request) is refused, so a shoulder-surfed code can't be replayed.
        const { count } = await tx.platformGrant.updateMany({
            where: { id: grant.id, OR: [{ mfaLastUsedStep: null }, { mfaLastUsedStep: { lt: step } }] },
            data: { mfaLastUsedStep: step, ...(firstEnrolment && { mfaEnabledAt: new Date() }) },
        });
        if (count === 0) throw new AppError("That code was already used. Wait for the next one.", 401);
        await tx.session.update({ where: { id: session.id }, data: { mfaVerifiedAt: new Date() } });
        const ipAddress = requestIp(req);
        if (firstEnrolment) await recordAdminAudit(tx, { actorId: operator.userId, action: "operator.mfa_enrolled", targetType: "operator", targetId: operator.userId, ipAddress });
        await recordAdminAudit(tx, { actorId: operator.userId, action: "operator.signed_in", targetType: "operator", targetId: operator.userId, ipAddress });
    });

    logger.info(`Operator signed in userId=${operator.userId}`);
    res.status(200).json({
        status: "success",
        data: { operator: operatorProfile({ id: operator.userId, name: operator.name, email: operator.email }, true, true) },
    });
});

export const operatorMe = catchAsync(async (req, res) => {
    const { operator, session, grant } = requireOperatorContext(req);
    res.status(200).json({
        status: "success",
        data: { operator: operatorProfile({ id: operator.userId, name: operator.name, email: operator.email }, Boolean(grant.mfaEnabledAt), Boolean(session.mfaVerifiedAt)) },
    });
});

export const operatorLogout = catchAsync(async (req, res) => {
    const { operator, session } = requireOperatorContext(req);
    await revokeSession(session.id);
    clearOperatorCookie(res);
    if (session.mfaVerifiedAt) {
        await prisma.$transaction((tx) =>
            recordAdminAudit(tx, { actorId: operator.userId, action: "operator.signed_out", targetType: "operator", targetId: operator.userId, ipAddress: requestIp(req) })
        );
    }
    res.status(200).json({ status: "success", message: "Signed out" });
});
