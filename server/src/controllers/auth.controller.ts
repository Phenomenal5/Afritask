import type { Request, Response } from 'express';
import prisma, { type PublicUser } from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import {
    deliverWelcomeEmail,
    sendEmailVerificationCode,
    deliverPasswordChangedEmail,
    sendPasswordResetEmail
} from '../utils/email.js';
import logger, { errorMessage } from '../utils/logger.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import { assertValidEmail, assertValidPassword, normalizeName, parseAge, parseTimezone } from '../utils/userValidation.js';
import { requireUser } from '../middlewares/auth.middleware.js';
import CLIENT_URL from '../config/clientUrl.js';
import routeParam from '../utils/routeParam.js';
import {
    consumeAccountToken,
    findAccountToken,
    issueAccountToken,
    revokeAccountTokens
} from '../services/accountTokenService.js';
import {
    REFRESH_TOKEN_COOKIE,
    clearAuthCookies,
    findSessionIdForRefreshToken,
    refreshSession,
    revokeAllSessions,
    revokeSession,
    startSession
} from '../services/sessionService.js';
import { CURRENT_TERMS_VERSION, hasAcceptedCurrentTerms } from '../config/terms.js';

const TERMS_NOT_ACCEPTED_MESSAGE = "Please accept the Terms of Service and Privacy Policy to create an account.";

const VERIFY_EMAIL_TOKEN_EXPIRES = process.env.VERIFY_EMAIL_TOKEN_EXPIRES_MS
    ? Number(process.env.VERIFY_EMAIL_TOKEN_EXPIRES_MS)
    : 60 * 60 * 1000; // 1 hour

const RESET_PASSWORD_TOKEN_EXPIRES = process.env.RESET_PASSWORD_TOKEN_EXPIRES_MS
    ? Number(process.env.RESET_PASSWORD_TOKEN_EXPIRES_MS)
    : 15 * 60 * 1000; // 15 minutes

// The Google hand-off code only has to survive one redirect + one request.
const OAUTH_EXCHANGE_CODE_EXPIRES = 2 * 60 * 1000; // 2 minutes

// NOTE: forgot-password answers the same way whether or not the email exists, so the
// endpoint can't be used to discover who has an account (SRS SR01).
const FORGOT_PASSWORD_RESPONSE = "If an account exists for that email, a password reset link has been sent.";

const createAndSendVerificationToken = async (user: PublicUser) => {
    const token = await issueAccountToken(user.id, "verify_email", VERIFY_EMAIL_TOKEN_EXPIRES);

    logger.info(`Verification token generated for user ${user.email}`);
    await sendEmailVerificationCode(user.email, token);
    logger.info(`Verification email sent to ${user.email}`);
    return token;
};

// Start a session (sets the httpOnly cookie) and return the user. No token in the body —
// the browser never gets to see the session secret.
// termsRequired: true → the client must show the accept-terms step before anything else
// (Google sign-ups, accounts from before terms existed, or after the terms change).
const sendAuthResponse = async (req: Request, res: Response, user: PublicUser, statusCode: number) => {
    await startSession(req, res, user.id);

    res.status(statusCode).json({
        status: "success",
        user,
        termsRequired: !hasAcceptedCurrentTerms(user)
    });
};

export const signup = catchAsync(async (req, res, next) => {
    const { name, email, password, age, timezone, acceptTerms } = req.body;
    try {
        if (!name || !email || !password) {
            return next(new AppError("Please provide all required fields", 400));
        }

        // NOTE: strictly `true` — a string "false" or "on" must not count as agreement.
        if (acceptTerms !== true) {
            return next(new AppError(TERMS_NOT_ACCEPTED_MESSAGE, 400));
        }

        // NOTE: body values go straight into Prisma `where` clauses below. A non-string
        // (e.g. { "not": "" }) would be read as a filter operator — reject it up front.
        assertValidEmail(email);

        const existingUser = await prisma.user.findUnique({ where: { email } });
        if (existingUser) {
            return next(new AppError("Email already in use", 400));
        }

        const user = await prisma.user.create({
            data: {
                name: normalizeName(name),
                email: assertValidEmail(email),
                password: await hashPassword(assertValidPassword(password)),
                age: parseAge(age),
                timezone: parseTimezone(timezone),
                termsAcceptedAt: new Date(),
                termsVersion: CURRENT_TERMS_VERSION,
            },
        });

        logger.info(`New user signup: ${email}`);

        // NOTE: the account is unusable until the verification email lands, so a
        // send failure must not leave a half-created user behind. It used to:
        // the row survived, a retry answered "Email already in use", and logging
        // in answered "verify your email" — a dead end with no way out.
        try {
            await createAndSendVerificationToken(user);
        } catch (emailError) {
            await prisma.user.delete({ where: { id: user.id } });
            logger.error(`Signup rolled back for ${email}: verification email failed — ${errorMessage(emailError)}`);
            return next(new AppError(
                "We couldn't send your verification email. Please try again in a moment.",
                502
            ));
        }

        return res.status(201).json({
            status: "success",
            message: "Signup successful. Please check your email to verify your account."
        });
    } catch (error) {
        next(error);
    }
})


export const resetPassword = catchAsync(async (req, res, next) => {
    const token = routeParam(req, "token");
    const { password } = req.body;

    try {
        if (!token) {
            return next(new AppError("Please provide a password reset token", 400));
        }

        if (!password) {
            return next(new AppError("Please provide a new password", 400));
        }

        // Validate before consuming, so a too-short password doesn't burn the link.
        const passwordHash = await hashPassword(assertValidPassword(password));

        // Single-use: of two concurrent submits with the same link, only one succeeds.
        const userId = await consumeAccountToken(token, "reset_password");
        if (!userId) {
            logger.warn(`Password reset failed with invalid, used or expired token`);
            return next(new AppError("Invalid or expired password reset token", 400));
        }

        const user = await prisma.user.update({
            where: { id: userId },
            data: { password: passwordHash },
        });

        // A reset means the password may have been compromised: end every existing session.
        await revokeAllSessions(user.id);

        logger.info(`Password reset successfully for user ${user.email}`);
        await deliverPasswordChangedEmail(user.email);

        res.status(200).json({
            status: "success",
            message: "Password reset successfully"
        });
    } catch (error) {
        next(error);
    }
})


export const login = catchAsync(async (req, res, next) => {
    const { email, password } = req.body;
    try {
        // typeof checks: a non-string email would act as a Prisma filter operator.
        if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
            logger.warn(`Login attempt with missing credentials: email=${email || 'none'}`);
            return next(new AppError("Please provide email and password", 400));
        }

        // password is omitted by default (config/prisma.ts) — opt back in for this one check
        const userWithPassword = await prisma.user.findUnique({
            where: { email },
            omit: { password: false },
        });


        if (!userWithPassword) {
            logger.warn(`Invalid login attempt for email: ${email}`);
            return next(new AppError("Invalid email or password", 401));
        }

        if (!userWithPassword.isVerified) {
            await createAndSendVerificationToken(userWithPassword);
            logger.warn(`Unverified user login blocked for email: ${email}`);
            return next(new AppError(
                "Please verify your email before logging in. A verification email has been sent.",
                401
            ));
        }

        // check if user exists and password is correct
        const isMatch = await comparePassword(password, userWithPassword.password);
        if (!isMatch) {
            logger.warn(`Invalid password attempt for email: ${email}`);
            return next(new AppError("Invalid email or password", 401));
        }

        // Never echo the hash back, even though we fetched it.
        const { password: _passwordHash, ...user } = userWithPassword;

        logger.info(`User logged in: ${email}`);
        await sendAuthResponse(req, res, user, 200);
    } catch (error) {
        next(error);
    }
})

export const verifyEmail = catchAsync(async (req, res, next) => {
    const token = routeParam(req, "token");
    try {
        if (!token) {
            return next(new AppError("Invalid or expired verification token", 400));
        }

        const accountToken = await findAccountToken(token, "verify_email");
        if (!accountToken) {
            logger.warn(`Invalid email verification attempt`);
            return next(new AppError("Invalid or expired verification token", 400));
        }
        const { user } = accountToken;

        // NOTE: verification is deliberately IDEMPOTENT. The same link legitimately
        // arrives more than once — React StrictMode runs the verify effect twice in dev,
        // and mail scanners (Outlook Safe Links & co) pre-fetch links before anyone
        // clicks. Answering the repeat with 400 surfaced in the UI as "invalid or
        // expired" on a verification that had in fact just succeeded. So a link whose
        // account is already verified answers success — it grants nothing (this route
        // starts no session) and can't verify anything new.
        if (user.isVerified) {
            logger.info(`Email already verified for user ${user.email}`);
            return res.status(200).json({
                status: "success",
                message: "Email already verified"
            });
        }

        // An older link that a resend replaced.
        if (accountToken.usedAt) {
            logger.warn(`Replaced verification link used for user ${user.email}`);
            return next(new AppError("Invalid or expired verification token", 400));
        }

        if (accountToken.expiresAt.getTime() < Date.now()) {
            await createAndSendVerificationToken(user);
            logger.warn(`Expired verification token used for user ${user.email}. New token sent.`);

            return next(new AppError(
                "Verification token expired. A new verification email has been sent.",
                400
            ));
        }

        // Consume the token and verify the account together. The conditional updates
        // are atomic, so a duplicate request can't also think it was first — otherwise
        // both would fire off a welcome email.
        const [, claimed] = await prisma.$transaction([
            prisma.accountToken.updateMany({
                where: { id: accountToken.id, usedAt: null },
                data: { usedAt: new Date() },
            }),
            prisma.user.updateMany({
                where: { id: user.id, isVerified: false },
                data: { isVerified: true },
            }),
        ]);

        if (claimed.count === 0) {
            logger.info(`Email already verified for user ${user.email}`);
            return res.status(200).json({
                status: "success",
                message: "Email already verified"
            });
        }

        logger.info(`Email verified successfully for user ${user.email}`);
        // Local signups only earn the welcome once the address is proven.
        // Google signups get theirs in config/passport.ts instead.
        await deliverWelcomeEmail(user.email, user.name);

        res.status(200).json({
            status: "success",
            message: "Email verified successfully"
        });
    } catch (error) {
        next(error);
    }
});


export const me = catchAsync(async (req, res, next) => {
    const userId = requireUser(req).id;

    try {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            logger.warn(`Authenticated user not found: ${userId}`);
            return next(new AppError("User not found", 404));
        }


        if (!user.isVerified) {
            logger.warn(`Unverified access attempt for user ${user.email}`);
            return next(new AppError("Please verify your email before accessing this resource", 401));
        }

        logger.info(`Authenticated user accessed profile: ${user.email}`);
        res.status(200).json({
            status: "success",
            user,
            termsRequired: !hasAcceptedCurrentTerms(user)
        });
    } catch (error) {
        next(error);
    }
})

export const forgotPassword = catchAsync(async (req, res, next) => {
    const { email } = req.body;
    try {
        // typeof check: a non-string email would act as a Prisma filter operator.
        if (typeof email !== "string" || !email) {
            logger.warn(`Forgot password requested without email`);
            return next(new AppError("Please provide your email", 400));
        }

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
            logger.warn(`Forgot password requested for missing user: ${email}`);
            return res.status(200).json({ status: "success", message: FORGOT_PASSWORD_RESPONSE });
        }

        // NOTE: mint a fresh token and PERSIST it *before* emailing. An earlier
        // version emailed a token it never saved, so resetPassword could never
        // match it and every reset link died with "Invalid or expired token".
        // Issuing also retires any previous unused reset link.
        const token = await issueAccountToken(user.id, "reset_password", RESET_PASSWORD_TOKEN_EXPIRES);

        try {
            await sendPasswordResetEmail(email, token);
            logger.info(`Password reset email sent to ${email}`);
        } catch (emailError) {
            // Don't leave a live reset token behind for a link nobody received. The
            // response stays generic (a 502 here would confirm the account exists).
            await revokeAccountTokens(user.id, "reset_password");
            logger.error(`Password reset email failed for ${email}: ${errorMessage(emailError)}`);
        }

        res.status(200).json({ status: "success", message: FORGOT_PASSWORD_RESPONSE });
    } catch (error) {
        next(error);
    }
});


// Accept the current Terms of Service + Privacy Policy — for accounts that didn't tick the
// box at signup (Google sign-ups, older accounts) or when the terms have changed since.
export const acceptTerms = catchAsync(async (req, res, next) => {
    if (req.body?.acceptTerms !== true) {
        return next(new AppError("Tick the box to accept the Terms of Service and Privacy Policy.", 400));
    }

    const user = await prisma.user.update({
        where: { id: requireUser(req).id },
        data: { termsAcceptedAt: new Date(), termsVersion: CURRENT_TERMS_VERSION },
    });

    logger.info(`Terms ${CURRENT_TERMS_VERSION} accepted by user ${user.id}`);
    res.status(200).json({ status: "success", user, termsRequired: false });
});

// New access token (and a rotated refresh token) from the refresh-token cookie.
export const refresh = catchAsync(async (req, res, next) => {
    const rawSecret: unknown = req.cookies?.[REFRESH_TOKEN_COOKIE];
    const session = typeof rawSecret === "string" && rawSecret ? await refreshSession(res, rawSecret) : null;
    if (!session) {
        // Expired, revoked or unknown — drop the dead cookies so the browser stops sending them.
        clearAuthCookies(res);
        return next(new AppError("Your session has ended. Please sign in again.", 401));
    }
    res.status(200).json({ status: "success" });
});

// Ends the session making the request (other devices stay signed in).
// NOTE: no `protect` — signing out must work with only the refresh token, e.g. after the
// access token expired. It revokes the session in the database, so the refresh token is
// dead even if a copy of the cookie survives somewhere.
export const logout = catchAsync(async (req, res, next) => {
    const rawSecret: unknown = req.cookies?.[REFRESH_TOKEN_COOKIE];
    const sessionId = typeof rawSecret === "string" && rawSecret ? await findSessionIdForRefreshToken(rawSecret) : null;
    if (sessionId) await revokeSession(sessionId);
    clearAuthCookies(res);

    logger.info(`User logged out: ${sessionId ? `session ${sessionId}` : 'no live session'}`);
    res.status(200).json({
        status: "success",
        message: "Logged out successfully"
    });
})

// Handle Google login/signup after Passport has attached the user to req.user.
// NOTE: OAuth arrives here as a top-level browser redirect to the API's own domain,
// where a cookie would be set for the wrong site. So instead of a session we mint a
// short-lived single-use code and redirect to the client's /auth/callback, which
// POSTs it to /auth/google/exchange through the same-origin /api proxy — that
// response sets the session cookie on the client's domain. The old version put a
// JWT in this URL; a code that dies after one use (or 2 minutes) is far safer there.
export const googleCallback = catchAsync(async (req, res, next) => {
    if (!req.user) {
        logger.warn(`Google authentication failed: req.user missing`);
        return res.redirect(`${CLIENT_URL}/login?error=google`);
    }

    const exchangeCode = await issueAccountToken(req.user.id, "oauth_exchange", OAUTH_EXCHANGE_CODE_EXPIRES);
    logger.info(`Google OAuth login successful for user ${req.user.email}`);
    res.redirect(`${CLIENT_URL}/auth/callback?code=${exchangeCode}`);
})

// Second half of Google sign-in: trade the one-time code for a session cookie.
export const googleExchange = catchAsync(async (req, res, next) => {
    const { code } = req.body;
    if (typeof code !== "string" || !code) {
        return next(new AppError("Missing sign-in code", 400));
    }

    const userId = await consumeAccountToken(code, "oauth_exchange");
    const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
    if (!user) {
        logger.warn(`Google sign-in exchange failed: invalid, used or expired code`);
        return next(new AppError("Google sign-in expired. Please try again.", 401));
    }

    await sendAuthResponse(req, res, user, 200);
})
