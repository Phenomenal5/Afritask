import { listTaskActivity } from "../controllers/activity.controller.js";
import { createSubtask, deleteTask, editTask, getTaskById, updateTaskStatus } from "../controllers/task.controller.js";
import protect from "../middlewares/auth.middleware.js";
import express from "express"


const router = express.Router()


// Single-task routes. List/create live under /api/workspaces/:workspaceId/tasks.
// Each handler checks the caller is an active member of the task's workspace.
// NOTE: the old owner-only /api/task + /addTask-style aliases were removed with workspaces —
// a task now belongs to a workspace, so there is no "my tasks" create target any more.
router.get("/:id", protect, getTaskById)
router.put("/:id", protect, editTask)
router.patch("/:id/status", protect, updateTaskStatus)
router.delete("/:id", protect, deleteTask)
// One level of subtasks under a top-level task.
router.post("/:id/subtasks", protect, createSubtask)
// Read-only history of this task (who changed what, before/after).
router.get("/:id/activity", protect, listTaskActivity)


export default router
