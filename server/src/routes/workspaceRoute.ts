import express from "express";
import protect from "../middlewares/auth.middleware.js";
import { requireWorkspaceMember, requireWorkspaceRole } from "../middlewares/workspaceAccess.middleware.js";
import { createWorkspace, getWorkspace, listMyWorkspaces, renameWorkspace } from "../controllers/workspace.controller.js";
import { createWorkspaceTask, listWorkspaceTasks } from "../controllers/task.controller.js";


const router = express.Router();

router.use(protect);

router.get("/", listMyWorkspaces);
router.post("/", createWorkspace);

// Everything below targets one workspace and requires an active membership in it.
router.get("/:workspaceId", requireWorkspaceMember, getWorkspace);
// NOTE: rename is Owner-only (PRD §8), not Owner+Admin.
router.patch("/:workspaceId", requireWorkspaceMember, requireWorkspaceRole("owner"), renameWorkspace);

router.get("/:workspaceId/tasks", requireWorkspaceMember, listWorkspaceTasks);
router.post("/:workspaceId/tasks", requireWorkspaceMember, createWorkspaceTask);


export default router;
