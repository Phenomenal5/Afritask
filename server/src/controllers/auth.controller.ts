import { randomBytes } from 'crypto';
import type { Response } from 'express';
import prisma, { type PublicUser } from '../config/prisma.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import {
    deliverWelcomeEmail,
    sendEmailVerificationCode,
    sendPasswordChangedEmail,
    sendPasswordResetEmail
} from '../utils/email.js';
import generateToken from '../utils/jwt.js';
import logger, { errorMessage } from '../utils/logger.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import { assertValidEmail, assertValidPassword, normalizeName, parseAge } from '../utils/userValidation.js';
import { requireUser } from '../middlewares/auth.middleware.js';
import CLIENT_URL from '../config/clientUrl.js';
import routeParam from '../utils/routeParam.js';

const VERIFY_EMAIL_TOKEN_EXPIRES = process.env.VERIFY_EMAIL_TOKEN_EXPIRES_MS
    ? Number(process.env.VERIFY_EMAIL_TOKEN_EXPIRES_MS)
    : 60 * 60 * 1000; // 1 hour

const RESET_PASSWORD_TOKEN_EXPIRES = process.env.RESET_PASSWORD_TOKEN_EXPIRES_MS
    ? Number(process.env.RESET_PASSWORD_TOKEN_EXPIRES_MS)
    : 15 * 60 * 1000; // 15 minutes

const createAndSendVerificationToken = async (user: PublicUser) => {
    const token = randomBytes(32).toString("hex");

    await prisma.user.update({
        where: { id: user.id },
        data: {
            verifyEmailToken: token,
            verifyEmailExpires: new Date(Date.now() + VERIFY_EMAIL_TOKEN_EXPIRES),
        },
    });

    logger.info(`Verification token generated for user ${user.email}`);
    await sendEmailVerificationCode(user.email, token);
    logger.info(`Verification email sent to ${user.email}`);
    return token;
};

const sendAuthResponse = (user: PublicUser, statusCode: number, res: Response) => {
    const token = generateToken(user);

    res.status(statusCode).json({
        status: "success",
        token,
        user
    });
};

export const signup = catchAsync(async (req, res, next) => {
    const { name, email, password, age } = req.body;
    try {
        if (!name || !email || !password) {
            return next(new AppError("Please provide all required fields", 400));
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

        const user = await prisma.user.findFirst({
            where: {
                resetPasswordToken: token,
                resetPasswordExpires: { gt: new Date() }
            }
        });


        if (!user) {
            logger.warn(`Password reset failed with invalid token: ${token}`);
            return next(new AppError("Invalid or expired password reset token", 400));
        }

        await prisma.user.update({
            where: { id: user.id },
            data: {
                password: await hashPassword(assertValidPassword(password)),
                resetPasswordToken: null,
                resetPasswordExpires: null,
            },
        });

        logger.info(`Password reset successfully for user ${user.email}`);
        await sendPasswordChangedEmail(user.email);

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
        sendAuthResponse(user, 200, res);
    } catch (error) {
        next(error);
    }
})

export const verifyEmail = catchAsync(async (req, res, next) => {
    const token = routeParam(req, "token");
    try {
        // NOTE: Prisma treats `where: { verifyEmailToken: undefined }` as NO filter and
        // would match the first user in the table — never query with a missing token.
        if (!token) {
            return next(new AppError("Invalid or expired verification token", 400));
        }

        const user = await prisma.user.findFirst({
            where: { verifyEmailToken: token },
            omit: { verifyEmailExpires: false },
        });

        if (!user) {
            logger.warn(`Invalid email verification attempt with token: ${token}`);
            return next(new AppError("Invalid or expired verification token", 400));
        }

        if (user.verifyEmailExpires && user.verifyEmailExpires.getTime() < Date.now() && !user.isVerified) {
            await createAndSendVerificationToken(user);
            logger.warn(`Expired verification token used for user ${user.email}. New token sent.`);

            return next(new AppError(
                "Verification token expired. A new verification email has been sent.",
                400
            ));
        }

        // NOTE: verification is deliberately IDEMPOTENT, and the token is left
        // in place rather than cleared. The same link legitimately arrives more
        // than once — React StrictMode runs the verify effect twice in dev, and
        // mail scanners (Outlook Safe Links & co) pre-fetch links before anyone
        // clicks. Clearing the token on first use made the second request 400,
        // which surfaced in the UI as "invalid or expired" on a verification
        // that had in fact just succeeded. The token grants nothing by itself —
        // this route issues no JWT — and it stops working once it expires.
        const claimed = await prisma.user.updateMany({
            where: { id: user.id, isVerified: false },
            data: { isVerified: true },
        });

        // The conditional update is atomic so the duplicate request can't also think
        // it was first — otherwise both would fire off a welcome email.
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
        sendAuthResponse(user, 200, res);
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
            return next(new AppError("User not found", 404));
        }

        // NOTE: mint a fresh token and PERSIST it *before* emailing. The old
        // version emailed a token it never saved, so resetPassword could never
        // match it and every reset link died with "Invalid or expired token".
        // (It also had a branch that re-sent the previous, already-expired
        // token — dropped: a new request always earns a new token.)
        const token = randomBytes(32).toString("hex");
        await prisma.user.update({
            where: { id: user.id },
            data: {
                resetPasswordToken: token,
                resetPasswordExpires: new Date(Date.now() + RESET_PASSWORD_TOKEN_EXPIRES),
            },
        });

        try {
            await sendPasswordResetEmail(email, token);
        } catch (emailError) {
            // Don't leave a live reset token behind for a link nobody received.
            await prisma.user.update({
                where: { id: user.id },
                data: { resetPasswordToken: null, resetPasswordExpires: null },
            });

            logger.error(`Password reset email failed for ${email}: ${errorMessage(emailError)}`);
            return next(new AppError(
                "We couldn't send your password reset email. Please try again in a moment.",
                502
            ));
        }

        logger.info(`Password reset email sent to ${email}`);
        res.status(200).json({
            status: "success",
            message: "Password reset link has been sent to your email"
        });
    } catch (error) {
        next(error);
    }
});


export const logout = catchAsync(async (req, res, next) => {
    logger.info(`User logout called: ${req.user?.id || 'unknown'}`);
    res.status(200).json({
        status: "success",
        message: "Logged out successfully"
    });
})

// Handle Google login/signup after Passport has attached the user to req.user.
// NOTE: OAuth arrives here as a top-level browser redirect, NOT an XHR — so we
// must NOT return JSON (the browser would just render it on the API domain and
// the token would never reach the app). Instead we mint the JWT and redirect
// back to the frontend /auth/callback, which stores it exactly like a normal
// login. Keep this route in sync with the client callback page.
export const googleCallback = catchAsync(async (req, res, next) => {
    if (!req.user) {
        logger.warn(`Google authentication failed: req.user missing`);
        return res.redirect(`${CLIENT_URL}/login?error=google`);
    }

    const token = generateToken(req.user);
    logger.info(`Google OAuth login successful for user ${req.user.email}`);
    // Token travels in the query string; the callback page reads it once and
    // moves it into localStorage, then cleans the URL by routing to /dashboard.
    res.redirect(`${CLIENT_URL}/auth/callback?token=${token}`);
})
