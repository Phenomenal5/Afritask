import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger from "../utils/logger.js";
import { sendPasswordChangedEmail } from "../utils/email.js";

export const updateProfile = catchAsync(async (req, res, next) => {
  const { name, age } = req.body;
  const userId = req.user.id;
  logger.info(`Profile update requested for userId=${userId}`);
  try {
    const user = await User.findById( userId );
    if (!user) {
      logger.warn(`Profile update failed: user not found userId=${userId}`);
      return next(new AppError("User not found", 404));
    }

    if(req.file) {
      logger.info(`Uploaded file metadata: ${JSON.stringify(req.file)}`)
      // store a web-accessible path (public is served at /)
      user.photo = `/uploads/profile/${req.file.filename}`;
    }

    if(name !== undefined) user.name = name
    if(age !== undefined) user.age = age
    // if(name !== undefined) user.name = name
    await user.save()
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
  const userId = req.user.id;
  try {
    if (!currentPassword || !newPassword) {
      logger.warn(`Password update requested with missing fields for userId=${userId}`);
      return next(new AppError("Please provide current password and new password", 400));
    }

    const user = await User.findById(userId).select("+password");
    if (!user) {
      logger.warn(`Password update failed: user not found userId=${userId}`);
      return next(new AppError("User not found", 404));
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      logger.warn(`Current password mismatch for user ${user.email}`);
      return next(new AppError("Current password is incorrect", 401));
    }
    
    user.password = newPassword;
    await user.save();

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
