/**
 * Project service wrappers for the backend project routes.
 */
import api from "@/lib/api";

// A workspace's projects with task counts. Archived ones only when asked for.
export const getWorkspaceProjects = (workspaceId, { includeArchived = false } = {}) =>
  api.get(`/workspaces/${workspaceId}/projects`, { params: includeArchived ? { includeArchived: true } : {} });

// Owner/Admin only.
export const createProject = (workspaceId, { name, description }) =>
  api.post(`/workspaces/${workspaceId}/projects`, { name, description });

export const getProject = (projectId) => api.get(`/projects/${projectId}`);

// { name?, description?, state?: "active" | "on_hold" | "completed" } — Owner/Admin only.
export const updateProject = (projectId, changes) => api.patch(`/projects/${projectId}`, changes);

export const archiveProject = (projectId) => api.post(`/projects/${projectId}/archive`);
export const restoreProject = (projectId) => api.post(`/projects/${projectId}/restore`);
