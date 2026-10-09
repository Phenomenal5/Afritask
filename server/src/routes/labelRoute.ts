import express from "express";
import protect from "../middlewares/auth.middleware.js";
import { deleteLabel, updateLabel } from "../controllers/label.controller.js";


const router = express.Router();

// Rename/recolor and delete. List/create live under /api/workspaces/:workspaceId/labels.
// The controller checks the caller manages the label's workspace.
router.use(protect);

router.patch("/:labelId", updateLabel);
router.delete("/:labelId", deleteLabel);


export default router;
