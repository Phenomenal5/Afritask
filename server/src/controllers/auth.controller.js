import { randomBytes } from 'crypto';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import {
    sendEmailVerificationCode,
    sendPasswordChangedEmail,
    sendPasswordResetEmail,
    sendWelcomeEmail
} from '../utils/email.js';
import generateToken from '../utils/jwt.js';
import logger from '../utils/logger.js';
import CLIENT_URL from '../config/clientUrl.js';

const VERIFY_EMAIL_TOKEN_EXPIRES = process.env.VERIFY_EMAIL_TOKEN_EXPIRES_MS
    ? Number(process.env.VERIFY_EMAIL_TOKEN_EXPIRES_MS)
    : 60 * 60 * 1000; // 1 hour

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
        await createAndSendVerificationToken(user);

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

        if (user.verifyEmailExpires && user.verifyEmailExpires < Date.now()) {
            await createAndSendVerificationToken(user);
            logger.warn(`Expired verification token used for user ${user.email}. New token sent.`);

            return next(new AppError(
                "Verification token expired. A new verification email has been sent.",
                400
            ));
        }

        user.isVerified = true;
        user.verifyEmailToken = undefined;
        user.verifyEmailExpires = undefined;
        await user.save();

        logger.info(`Email verified successfully for user ${user.email}`);
        // Send a welcome email only after the account has been verified.
        await sendWelcomeEmail(user.email, user.name);

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

        const token = randomBytes(32).toString("hex");


        if (user.resetPasswordToken && user.resetPasswordExpires < Date.now()) {
            await user.updateOne({ resetPasswordExpires: Date.now() + 15 * 60 * 1000 }); // 15 minutes
            await sendPasswordResetEmail(email, user.resetPasswordToken);
            logger.info(`Existing expired reset token refreshed for user ${email}`);
            return res.status(200).json({
                status: "success",
                message: "Password reset link has been sent to your email"
            });
        }

        await sendPasswordResetEmail(email, token);
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
