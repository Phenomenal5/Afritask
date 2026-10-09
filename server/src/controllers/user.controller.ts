import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger from "../utils/logger.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { sendPasswordChangedEmail } from "../utils/email.js";
import { comparePassword, hashPassword } from "../utils/password.js";
import { assertValidPassword, normalizeName, parseAge } from "../utils/userValidation.js";

export const updateProfile = catchAsync(async (req, res, next) => {
  const { name, age } = req.body;
  const userId = requireUser(req).id;
  logger.info(`Profile update requested for userId=${userId}`);
  try {
    const existingUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!existingUser) {
      logger.warn(`Profile update failed: user not found userId=${userId}`);
      return next(new AppError("User not found", 404));
    }

    if(req.file) {
      logger.info(`Uploaded file metadata: ${JSON.stringify(req.file)}`)
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        // store a web-accessible path (public is served at /)
        ...(req.file && { photo: `/uploads/profile/${req.file.filename}` }),
        ...(name !== undefined && { name: normalizeName(name) }),
        ...(age !== undefined && { age: parseAge(age) ?? null }),
      },
    });

    logger.info(`Profile updated successfully for user ${user.email}`);
    res.status(200).json({
      status: "success",
      user,
    });
  } catch (error) {
    next(error);
  }
});

export const updatePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  const userId = requireUser(req).id;
  try {
    if (!currentPassword || !newPassword) {
      logger.warn(`Password update requested with missing fields for userId=${userId}`);
      return next(new AppError("Please provide current password and new password", 400));
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      omit: { password: false },
    });
    if (!user) {
      logger.warn(`Password update failed: user not found userId=${userId}`);
      return next(new AppError("User not found", 404));
    }

    const isMatch = await comparePassword(currentPassword, user.password);
    if (!isMatch) {
      logger.warn(`Current password mismatch for user ${user.email}`);
      return next(new AppError("Current password is incorrect", 401));
    }

    await prisma.user.update({
      where: { id: userId },
      data: { password: await hashPassword(assertValidPassword(newPassword)) },
    });

    logger.info(`Password updated successfully for user ${user.email}`);
    // Notify the user that their password was changed successfully.
    await sendPasswordChangedEmail(user.email);

    res.status(200).json({
      status: "success",
      message: "Password updated successfully",
    });
  } catch (error) {
    next(error);
  }
});
