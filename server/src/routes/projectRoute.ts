import express from "express";
import protect from "../middlewares/auth.middleware.js";
import { archiveProject, getProject, restoreProject, updateProject } from "../controllers/project.controller.js";


const router = express.Router();

// Single-project routes. List/create live under /api/workspaces/:workspaceId/projects.
// The controller checks membership of the project's workspace and the manager role.
router.use(protect);

router.get("/:projectId", getProject);
router.patch("/:projectId", updateProject);
router.post("/:projectId/archive", archiveProject);
router.post("/:projectId/restore", restoreProject);


export default router;
