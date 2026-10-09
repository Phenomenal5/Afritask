import { createTask, deleteTask, editTask, getAllTask, getTaskById, updateTaskStatus } from "../controllers/task.controller.js";
import protect from "../middlewares/auth.middleware.js";
import express from "express"


const router = express.Router()


// Every task route is protected and controllers also scope queries to req.user.id.
router.get("/", protect, getAllTask)
router.post("/", protect, createTask)
router.get("/:id", protect, getTaskById)
router.put("/:id", protect, editTask)
router.patch("/:id/status", protect, updateTaskStatus)
router.delete("/:id", protect, deleteTask)

// Backward-compatible routes for the earlier API names.
router.post("/addTask", protect, createTask)
router.get("/getTask/:id", protect, getTaskById)
router.put("/editTask/:id", protect, editTask)
router.delete("/deleteTask/:id", protect, deleteTask)



export default router
