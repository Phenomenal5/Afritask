import express from "express";
import { upload } from "../middlewares/upload.js";
import { updateProfile, updatePassword } from "../controllers/user.controller.js";
import protect from "../middlewares/auth.middleware.js";


const router = express.Router();


router.put("/profile", protect, upload.single("photo"), updateProfile);
router.put("/password", protect, updatePassword);


export default router;
