import { randomBytes } from 'crypto';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import {
    deliverWelcomeEmail,
    sendEmailVerificationCode,
    sendPasswordChangedEmail,
    sendPasswordResetEmail
} from '../utils/email.js';
import generateToken from '../utils/jwt.js';
import logger from '../utils/logger.js';
import CLIENT_URL from '../config/clientUrl.js';

const VERIFY_EMAIL_TOKEN_EXPIRES = process.env.VERIFY_EMAIL_TOKEN_EXPIRES_MS
    ? Number(process.env.VERIFY_EMAIL_TOKEN_EXPIRES_MS)
    : 60 * 60 * 1000; // 1 hour

const RESET_PASSWORD_TOKEN_EXPIRES = process.env.RESET_PASSWORD_TOKEN_EXPIRES_MS
    ? Number(process.env.RESET_PASSWORD_TOKEN_EXPIRES_MS)
    : 15 * 60 * 1000; // 15 minutes

const createAndSendVerificationToken = async (user) => {
    const token = randomBytes(32).toString("hex");

    user.verifyEmailToken = token;
    user.verifyEmailExpires = Date.now() + VERIFY_EMAIL_TOKEN_EXPIRES;
    await user.save({ validateBeforeSave: false });

    logger.info(`Verification token generated for user ${user.email}`);
    await sendEmailVerificationCode(user.email, token);
    logger.info(`Verification email sent to ${user.email}`);
    return token;
};

const sendAuthResponse = (user, statusCode, res) => {
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

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return next(new AppError("Email already in use", 400));
        }

        const user = await User.create({
            name,
            email,
            password,
            age
        });

        logger.info(`New user signup: ${email}`);

        // NOTE: the account is unusable until the verification email lands, so a
        // send failure must not leave a half-created user behind. It used to:
        // the row survived, a retry answered "Email already in use", and logging
        // in answered "verify your email" — a dead end with no way out.
        try {
            await createAndSendVerificationToken(user);
        } catch (emailError) {
            await User.deleteOne({ _id: user._id });
            logger.error(`Signup rolled back for ${email}: verification email failed — ${emailError.message}`);
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
    const { token } = req.params;
    const { password } = req.body;

    try {
        if (!token) {
            return next(new AppError("Please provide a password reset token", 400));
        }

        if (!password) {
            return next(new AppError("Please provide a new password", 400));
        }

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        }).select("+resetPasswordToken +resetPasswordExpires");


        if (!user) {
            logger.warn(`Password reset failed with invalid token: ${token}`);
            return next(new AppError("Invalid or expired password reset token", 400));
        }

        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

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
        if (!email || !password) {
            logger.warn(`Login attempt with missing credentials: email=${email || 'none'}`);
            return next(new AppError("Please provide email and password", 400));
        }

        // select the password field explicitly since it's set to select: false in the schema
        const user = await User.findOne({ email }).select("+password +isVerified");


        if (!user) {
            logger.warn(`Invalid login attempt for email: ${email}`);
            return next(new AppError("Invalid email or password", 401));
        }

        if (!user.isVerified) {
            await createAndSendVerificationToken(user);
            logger.warn(`Unverified user login blocked for email: ${email}`);
            return next(new AppError(
                "Please verify your email before logging in. A verification email has been sent.",
                401
            ));
        }

        // check if user exists and password is correct
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            logger.warn(`Invalid password attempt for email: ${email}`);
            return next(new AppError("Invalid email or password", 401));
        }

        logger.info(`User logged in: ${email}`);
        sendAuthResponse(user, 200, res);
    } catch (error) {
        next(error);
    }
})

export const verifyEmail = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    try {
        const user = await User.findOne({ verifyEmailToken: token })
            .select("+verifyEmailToken +verifyEmailExpires");

        if (!user) {
            logger.warn(`Invalid email verification attempt with token: ${token}`);
            return next(new AppError("Invalid or expired verification token", 400));
        }

        if (user.verifyEmailExpires && user.verifyEmailExpires < Date.now() && !user.isVerified) {
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
        const claimed = await User.findOneAndUpdate(
            { _id: user._id, isVerified: false },
            { $set: { isVerified: true } },
            { new: true }
        );

        // findOneAndUpdate is atomic so the duplicate request can't also think
        // it was first — otherwise both would fire off a welcome email.
        if (!claimed) {
            logger.info(`Email already verified for user ${user.email}`);
            return res.status(200).json({
                status: "success",
                message: "Email already verified"
            });
        }

        logger.info(`Email verified successfully for user ${claimed.email}`);
        // Local signups only earn the welcome once the address is proven.
        // Google signups get theirs in config/passport.js instead.
        await deliverWelcomeEmail(claimed.email, claimed.name);

        res.status(200).json({
            status: "success",
            message: "Email verified successfully"
        });
    } catch (error) {
        next(error);
    }
});


export const me = catchAsync(async (req, res, next) => {
    const userId = req.user.id;

    try {
        const user = await User.findById(userId);
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
        if (!email) {
            logger.warn(`Forgot password requested without email`);
            return next(new AppError("Please provide your email", 400));
        }
        const user = await User.findOne({ email }).select("+resetPasswordToken +resetPasswordExpires");
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
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + RESET_PASSWORD_TOKEN_EXPIRES;
        await user.save({ validateBeforeSave: false });

        try {
            await sendPasswordResetEmail(email, token);
        } catch (emailError) {
            // Don't leave a live reset token behind for a link nobody received.
            user.resetPasswordToken = undefined;
            user.resetPasswordExpires = undefined;
            await user.save({ validateBeforeSave: false });

            logger.error(`Password reset email failed for ${email}: ${emailError.message}`);
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
