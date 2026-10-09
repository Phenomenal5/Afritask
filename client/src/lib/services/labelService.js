/**
 * Label service wrappers. Applying labels to a task goes through updateTask({ labelIds }).
 */
import api from "@/lib/api";

export const getWorkspaceLabels = (workspaceId) => api.get(`/workspaces/${workspaceId}/labels`);

// Owner/Admin only.
export const createLabel = (workspaceId, { name, color }) => api.post(`/workspaces/${workspaceId}/labels`, { name, color });
export const updateLabel = (labelId, changes) => api.patch(`/labels/${labelId}`, changes);
export const deleteLabel = (labelId) => api.delete(`/labels/${labelId}`);
