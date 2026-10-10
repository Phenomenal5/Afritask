import express from "express";
import protect from "../middlewares/auth.middleware.js";
import { deleteComment, editComment } from "../controllers/comment.controller.js";


const router = express.Router();

// Edit and delete one comment. List/create live under /api/tasks/:id/comments.
// The controller checks membership of the comment's workspace, authorship and role.
router.use(protect);

router.patch("/:commentId", editComment);
router.delete("/:commentId", deleteComment);


export default router;
