/**
 * Monthly performance summary and its share links.
 */
import api from "@/lib/api";
import type { MonthSummary, PerformanceShare, TrendPoint } from "@/types/models";

export const getMyPerformance = (month?: string) =>
  api.get<{ data: { summary: MonthSummary; trend: TrendPoint[] } }>("/performance", { params: month ? { month } : {} });

export const listPerformanceShares = () => api.get<{ data: { shares: PerformanceShare[] } }>("/performance/shares");

export const createPerformanceShare = (month: string) => api.post<{ data: { share: PerformanceShare } }>("/performance/shares", { month });

export const revokePerformanceShare = (shareId: string) => api.delete(`/performance/shares/${shareId}`);

// Public — works signed out.
export const getSharedPerformance = (token: string) =>
  api.get<{ data: { owner: { name: string; photo: string | null }; summary: MonthSummary; trend: TrendPoint[] } }>(`/performance/shared/${token}`);
