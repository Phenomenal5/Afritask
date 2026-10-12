"use client";

// Team performance: each member's month in the workspace you have open, for its Owner and
// Admins. Only this workspace's work counts, never what someone does elsewhere. An Admin
// doesn't see the Owner's numbers (the server leaves them out).
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { getTeamPerformance } from "@/lib/services/performanceService";
import { describeFailure, type Failure } from "@/lib/errors";
import { useWorkspaces } from "@/context/WorkspaceContext";
import PageHeader from "@/components/layout/PageHeader";
import MonthStepper from "@/components/performance/MonthStepper";
import Avatar from "@/components/ui/Avatar";
import { RoleBadge } from "@/components/ui/Badges";
import { EmptyState, FailurePanel, Notice, SkeletonRows } from "@/components/ui/States";
import type { TeamMemberPerformance } from "@/types/models";

const percent = (rate: number | null) => (rate === null ? "No data" : `${Math.round(rate * 100)}%`);

export default function TeamPerformancePage() {
  const { activeWorkspace } = useWorkspaces();
  const workspaceId = activeWorkspace?.id;
  const allowed = activeWorkspace?.role === "owner" || activeWorkspace?.role === "admin";
  const [month, setMonth] = useState<string | null>(null);
  const [latestMonth, setLatestMonth] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMemberPerformance[] | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  const load = useCallback(
    async (requestedMonth?: string) => {
      if (!workspaceId) return;
      setFailure(null);
      setMembers(null);
      try {
        const response = await getTeamPerformance(workspaceId, requestedMonth);
        setMembers(response.data.data.members);
        setMonth(response.data.data.month);
        if (!requestedMonth) setLatestMonth(response.data.data.month);
      } catch (error) {
        setFailure(describeFailure(error, "We couldn't load the team's numbers."));
      }
    },
    [workspaceId]
  );

  useEffect(() => {
    if (allowed) load();
  }, [allowed, load]);

  const back = (
    <Link href="/performance" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-forest hover:underline">
      <ArrowLeft size={16} aria-hidden="true" />
      Your performance
    </Link>
  );

  if (activeWorkspace && !allowed) {
    return (
      <>
        <title>Team performance · Afritask</title>
        {back}
        <Notice icon={Lock} tone="neutral">
          Only this workspace&apos;s Owner and Admins can see the team&apos;s performance.
        </Notice>
      </>
    );
  }

  return (
    <>
      <title>{`Team performance · ${activeWorkspace?.name ?? "Afritask"}`}</title>
      {back}
      <PageHeader
        eyebrow={activeWorkspace?.name}
        title="Team performance"
        description={
          activeWorkspace?.role === "admin"
            ? "Each member's month in this workspace only. The Owner's numbers aren't shown to Admins."
            : "Each member's month in this workspace only. What they do in other workspaces isn't counted."
        }
        actions={<MonthStepper month={month} latestMonth={latestMonth} onChange={load} />}
      />

      {failure ? (
        <FailurePanel failure={failure} onRetry={() => load(month ?? undefined)} />
      ) : !members ? (
        <SkeletonRows rows={4} label="Loading the team's numbers" />
      ) : members.length === 0 ? (
        <EmptyState title="Nobody to show yet" body="Invite people to this workspace, and their month shows up here." />
      ) : (
        <ul aria-label="Members" className="divide-y divide-line-soft overflow-hidden rounded-[14px] border border-line bg-surface">
          {members.map((member) => (
            <li key={member.membershipId}>
              <Link
                href={`/performance/team/${member.membershipId}${month ? `?month=${month}` : ""}`}
                className="flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-surface-muted/60 sm:flex-row sm:items-center sm:gap-6 sm:px-5"
              >
                <span className="flex min-w-0 items-center gap-3 sm:w-64">
                  <Avatar user={member.user} size={34} />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-medium text-ink">{member.user.name}</span>
                    <RoleBadge role={member.role} />
                  </span>
                </span>
                <dl className="grid flex-1 grid-cols-3 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-6">
                  <Figure label="Completed" value={member.summary.completed} />
                  <Figure label="On time" value={percent(member.summary.onTimeRate)} />
                  <Figure label="Late" value={member.summary.completedLate} />
                  <Figure label="Extensions" value={member.summary.extensions} />
                  <Figure label="Tasks created" value={member.summary.tasksCreated} />
                  <Figure label="Projects" value={member.summary.projectsCreated} />
                </dl>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Figure({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-muted">{label}</dt>
      <dd className="text-[15px] font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}
