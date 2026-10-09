import express from "express";
import protect from "../middlewares/auth.middleware.js";
import { requireWorkspaceMember, requireWorkspaceRole } from "../middlewares/workspaceAccess.middleware.js";
import { createWorkspace, getWorkspace, listMyWorkspaces, renameWorkspace } from "../controllers/workspace.controller.js";
import { createWorkspaceTask, listWorkspaceTasks } from "../controllers/task.controller.js";
import { createInvitation, listWorkspaceInvitations } from "../controllers/invitation.controller.js";
import { invitationLimiter } from "../middlewares/rateLimiter.js";
import { createProject, listWorkspaceProjects } from "../controllers/project.controller.js";
import { createLabel, listLabels } from "../controllers/label.controller.js";
import { changeMemberRole, leaveWorkspace, removeMember, transferOwnership } from "../controllers/member.controller.js";


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

// Invitations: Owner and Admin (the controller limits which roles each may offer).
router.get("/:workspaceId/invitations", requireWorkspaceMember, requireWorkspaceRole("owner", "admin"), listWorkspaceInvitations);
router.post("/:workspaceId/invitations", requireWorkspaceMember, requireWorkspaceRole("owner", "admin"), invitationLimiter(), createInvitation);

// Projects: everyone views, Owner/Admin create.
router.get("/:workspaceId/projects", requireWorkspaceMember, listWorkspaceProjects);
router.post("/:workspaceId/projects", requireWorkspaceMember, requireWorkspaceRole("owner", "admin"), createProject);

// Labels: everyone sees them, Owner/Admin create.
router.get("/:workspaceId/labels", requireWorkspaceMember, listLabels);
router.post("/:workspaceId/labels", requireWorkspaceMember, requireWorkspaceRole("owner", "admin"), createLabel);

// Members (role rules beyond these gates live in member.controller.ts).
router.patch("/:workspaceId/members/:membershipId", requireWorkspaceMember, requireWorkspaceRole("owner"), changeMemberRole);
router.delete("/:workspaceId/members/:membershipId", requireWorkspaceMember, requireWorkspaceRole("owner", "admin"), removeMember);
router.post("/:workspaceId/leave", requireWorkspaceMember, leaveWorkspace);
router.post("/:workspaceId/transfer-ownership", requireWorkspaceMember, requireWorkspaceRole("owner"), transferOwnership);


export default router;
