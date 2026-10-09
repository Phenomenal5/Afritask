/**
 * Workspace service wrappers for the backend workspace routes.
 */
import api from "@/lib/api";

// Workspaces the signed-in user is an active member of, with their role in each.
export const getMyWorkspaces = () => api.get("/workspaces");

// Create a workspace; the server makes the caller its Owner.
export const createWorkspace = (name) => api.post("/workspaces", { name });

// One workspace with its current members.
export const getWorkspace = (workspaceId) => api.get(`/workspaces/${workspaceId}`);

// Rename (Owner only — the server enforces it).
export const renameWorkspace = (workspaceId, name) => api.patch(`/workspaces/${workspaceId}`, { name });
