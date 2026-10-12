"use client";

// One member's month in the workspace you have open (Owner and Admins): the same view as
// their own Performance page, but counting only this workspace's work.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getMemberPerformance } from "@/lib/services/performanceService";
import { describeFailure, type Failure } from "@/lib/errors";
import { useWorkspaces } from "@/context/WorkspaceContext";
import PageHeader from "@/components/layout/PageHeader";
import MonthStepper from "@/components/performance/MonthStepper";
import PerformanceView from "@/components/performance/PerformanceView";
import { FailurePanel, SkeletonRows } from "@/components/ui/States";
import type { MonthSummary, TeamMemberPerformance, TrendPoint } from "@/types/models";

type MemberReport = { member: Omit<TeamMemberPerformance, "summary">; summary: MonthSummary; trend: TrendPoint[] };

export default function MemberPerformancePage() {
  const { membershipId } = useParams<{ membershipId: string }>();
  const searchParams = useSearchParams();
  const { activeWorkspace } = useWorkspaces();
  const workspaceId = activeWorkspace?.id;
  const [report, setReport] = useState<MemberReport | null>(null);
  const [latestMonth, setLatestMonth] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  const load = useCallback(
    async (requestedMonth?: string) => {
      if (!workspaceId) return;
      setFailure(null);
      setReport(null);
      try {
        const response = await getMemberPerformance(workspaceId, membershipId, requestedMonth);
        setReport(response.data.data);
      } catch (error) {
        setFailure(describeFailure(error, "We couldn't load this member's numbers."));
      }
    },
    [workspaceId, membershipId]
  );

  // "This month" for the stepper's stop: ask once without a month.
  useEffect(() => {
    if (!workspaceId) return;
    getMemberPerformance(workspaceId, membershipId)
      .then((response) => setLatestMonth(response.data.data.summary.month))
      .catch(() => undefined);
  }, [workspaceId, membershipId]);

  useEffect(() => {
    load(searchParams.get("month") ?? undefined);
  }, [load, searchParams]);

  return (
    <>
      <title>{`${report?.member.user.name ?? "Member"} · Team performance · Afritask`}</title>
      <Link href="/performance/team" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-forest hover:underline">
        <ArrowLeft size={16} aria-hidden="true" />
        Team performance
      </Link>
      <PageHeader
        eyebrow={activeWorkspace?.name}
        title={report?.member.user.name ?? "Member"}
        description="Their month in this workspace only."
        actions={<MonthStepper month={report?.summary.month ?? null} latestMonth={latestMonth} onChange={(month) => load(month)} />}
      />
      {failure ? (
        <FailurePanel failure={failure} onRetry={() => load(report?.summary.month)} />
      ) : !report ? (
        <SkeletonRows rows={4} label="Loading their numbers" />
      ) : (
        <PerformanceView summary={report.summary} trend={report.trend} scopeNote={`in ${activeWorkspace?.name ?? "this workspace"}`} />
      )}
    </>
  );
}
