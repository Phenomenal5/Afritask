/**
 * Invitation service wrappers for the backend invitation routes.
 */
import api from "@/lib/api";

// ─── Recipient ─────────────────────
// Public: what an emailed invitation link points at (works signed out).
export const previewInvitation = (token) => api.get(`/invitations/preview/${token}`);

// Pending invitations addressed to the signed-in account.
export const getMyInvitations = () => api.get("/invitations/mine");

// Respond by emailed token ({ token }) or from the in-app list ({ invitationId }).
export const acceptInvitation = (reference) => api.post("/invitations/accept", reference);
export const declineInvitation = (reference) => api.post("/invitations/decline", reference);

// ─── Manager (Owner/Admin) ─────────────────────
export const getWorkspaceInvitations = (workspaceId) => api.get(`/workspaces/${workspaceId}/invitations`);
export const inviteToWorkspace = (workspaceId, { email, role }) =>
  api.post(`/workspaces/${workspaceId}/invitations`, { email, role });
export const resendInvitation = (invitationId) => api.post(`/invitations/${invitationId}/resend`);
export const revokeInvitation = (invitationId) => api.post(`/invitations/${invitationId}/revoke`);
