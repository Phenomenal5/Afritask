/**
 * Monthly performance summary, its share links, and team performance (Owners and Admins).
 */
import api from "@/lib/api";
import type { MonthSummary, PerformanceShare, SharedScope, TeamMemberPerformance, TrendPoint } from "@/types/models";

// No workspaceIds = every workspace.
export const getMyPerformance = (month?: string, workspaceIds?: string[]) =>
  api.get<{ data: { summary: MonthSummary; trend: TrendPoint[] } }>("/performance", {
    params: { month, workspaces: workspaceIds?.length ? workspaceIds.join(",") : undefined },
  });

export const listPerformanceShares = () => api.get<{ data: { shares: PerformanceShare[] } }>("/performance/shares");

export interface NewShareInput {
  month: string;
  workspaceIds: string[];
  showWorkspaceNames: boolean;
}

export const createPerformanceShare = (input: NewShareInput) => api.post<{ data: { share: PerformanceShare } }>("/performance/shares", input);

export const revokePerformanceShare = (shareId: string) => api.delete(`/performance/shares/${shareId}`);

// Public — works signed out.
export const getSharedPerformance = (token: string) =>
  api.get<{ data: { owner: { name: string; photo: string | null }; summary: MonthSummary; trend: TrendPoint[]; scope: SharedScope } }>(`/performance/shared/${token}`);

// Team performance: each member's month in ONE workspace (an Admin doesn't see the Owner).
export const getTeamPerformance = (workspaceId: string, month?: string) =>
  api.get<{ data: { month: string; members: TeamMemberPerformance[] } }>(`/workspaces/${workspaceId}/performance`, { params: { month } });

export const getMemberPerformance = (workspaceId: string, membershipId: string, month?: string) =>
  api.get<{ data: { member: Omit<TeamMemberPerformance, "summary">; summary: MonthSummary; trend: TrendPoint[] } }>(
    `/workspaces/${workspaceId}/performance/${membershipId}`,
    { params: { month } }
  );
