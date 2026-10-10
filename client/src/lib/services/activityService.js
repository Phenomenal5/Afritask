/**
 * Activity history (read-only). Pages are newest first; pass the previous page's
 * nextCursor as `before` to load older entries.
 */
import api from "@/lib/api";

export const getTaskActivity = (taskId, { before } = {}) => api.get(`/tasks/${taskId}/activity`, { params: { before } });

// Whole workspace, or one project's feed (its own events plus its tasks') with projectId.
export const getWorkspaceActivity = (workspaceId, { projectId, before } = {}) =>
  api.get(`/workspaces/${workspaceId}/activity`, { params: { projectId, before } });
