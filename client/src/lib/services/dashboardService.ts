/**
 * Dashboard counts. Each figure is computed by the server with the same rules as the task
 * list it links to (see server/API_DOCUMENTATION.md "Dashboard").
 */
import api from "@/lib/api";

export const getWorkspaceDashboard = (workspaceId: string) => api.get(`/workspaces/${workspaceId}/dashboard`);
