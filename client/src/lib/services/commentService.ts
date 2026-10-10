/**
 * Comment service wrappers. Mentions are sent as membership ids next to the text, so a
 * display name can never resolve to the wrong person.
 */
import api from "@/lib/api";

export interface CommentInput {
  body: string;
  mentionMembershipIds?: string[];
}

export const getTaskComments = (taskId: string) => api.get(`/tasks/${taskId}/comments`);

// Any active member, on work outside archived projects.
export const createComment = (taskId: string, input: CommentInput) => api.post(`/tasks/${taskId}/comments`, input);

// Author only. Omitting mentionMembershipIds keeps the comment's current mentions.
export const editComment = (commentId: string, input: CommentInput) => api.patch(`/comments/${commentId}`, input);

// Author, or an Owner/Admin moderating.
export const deleteComment = (commentId: string) => api.delete(`/comments/${commentId}`);
