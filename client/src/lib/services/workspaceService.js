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

// Owner only. What deleting would do: { mode: "permanent" | "soft", otherContributors, counts }.
export const getWorkspaceDeletionPreview = (workspaceId) => api.get(`/workspaces/${workspaceId}/deletion-preview`);

// Owner only. confirmName must equal the workspace's name exactly.
export const deleteWorkspace = (workspaceId, confirmName) => api.delete(`/workspaces/${workspaceId}`, { data: { confirmName } });

// ─── Members ─────────────────────
// Owner only: admin ⇄ member.
export const changeMemberRole = (workspaceId, membershipId, role) =>
  api.patch(`/workspaces/${workspaceId}/members/${membershipId}`, { role });

// Owner removes Admins/Members; Admin removes Members.
export const removeMember = (workspaceId, membershipId) =>
  api.delete(`/workspaces/${workspaceId}/members/${membershipId}`);

// Admin or Member leaving (the Owner must transfer first).
export const leaveWorkspace = (workspaceId) => api.post(`/workspaces/${workspaceId}/leave`);

// Owner hands ownership to an existing member and becomes an Admin.
export const transferOwnership = (workspaceId, membershipId) =>
  api.post(`/workspaces/${workspaceId}/transfer-ownership`, { membershipId });
