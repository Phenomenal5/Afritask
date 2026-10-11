"use client";

// Overview: the day, the way a planner opens it — the date and the day in one sentence,
// what's next, today as an agenda, the week ahead, who's on what, how projects are moving,
// and what changed recently. Every number comes from real task data and links to the exact
// tasks it counts (PRD FR14: "dashboard counts match their drill-down results").
import { useCallback } from "react";
import Link from "next/link";
import { ArrowRight, FolderKanban } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { useWorkspaceResources } from "@/context/WorkspaceResourcesContext";
import { useMyWork } from "@/context/MyWorkContext";
import { useWorkspaceTasks } from "@/hooks/useWorkspaceTasks";
import { useViewer } from "@/hooks/useViewer";
import { useNow } from "@/hooks/useNow";
import { useDashboard } from "@/hooks/useDashboard";
import { getWorkspaceActivity } from "@/lib/services/activityService";
import { cx } from "@/lib/cx";
import PageHeader from "@/components/layout/PageHeader";
import NextStepCard from "@/components/overview/NextStepCard";
import GettingStarted from "@/components/overview/GettingStarted";
import DayLine from "@/components/overview/DayLine";
import TodayAgenda from "@/components/overview/TodayAgenda";
import WeekAhead from "@/components/overview/WeekAhead";
import TeamPulse from "@/components/overview/TeamPulse";
import InvitationResponses from "@/components/people/InvitationResponses";
import ActivityFeed from "@/components/activity/ActivityFeed";
import { FailurePanel } from "@/components/ui/States";

const greetingFor = (now: Date | null) => {
  if (!now) return "Hello";
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
};

const ROLE_SENTENCES = { owner: "You're the Owner", admin: "You're an Admin", member: "You're a Member" } as const;

const ALL_TOP_LEVEL = {} as const;
const PROJECTS_SHOWN = 5;

export default function OverviewPage() {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspaces();
  const { projects, members, isManager, status: resourcesStatus } = useWorkspaceResources();
  const { myTasks, myTasksStatus, myTasksFailure, reloadMyTasks, invitations, removeInvitation } = useMyWork();
  const workspaceTasks = useWorkspaceTasks(activeWorkspace?.id, ALL_TOP_LEVEL);
  const viewer = useViewer();
  const now = useNow();

  // Counts come from the server, computed with the same rules as the lists they link to
  // (SRS SR14). NOTE: undefined (placeholder) until they've loaded — never a confident 0.
  const dashboard = useDashboard(activeWorkspace?.id);
  const workspaceCounts = dashboard.counts?.workspace;

  const workspaceId = activeWorkspace?.id;
  const loadActivity = useCallback((page: { before?: string }) => getWorkspaceActivity(workspaceId, page), [workspaceId]);

  const loading = myTasksStatus === "loading" || workspaceTasks.status === "loading" || !now;
  const firstName = user?.name?.split(" ")[0];
  const visibleProjects = projects.filter((project) => project.state !== "archived").slice(0, PROJECTS_SHOWN);
  const hasTeammates = members.length > 1;

  return (
    <>
      <title>{`Overview · ${activeWorkspace?.name ?? "Afritask"}`}</title>
      <PageHeader
        eyebrow={activeWorkspace ? `${activeWorkspace.name} · ${ROLE_SENTENCES[activeWorkspace.role]}` : undefined}
        title={`${greetingFor(now)}${firstName ? `, ${firstName}` : ""}`}
      >
        <div className="mt-2">
          <DayLine now={now} timezone={viewer.timezone} personal={dashboard.counts?.personal} />
        </div>
      </PageHeader>

      <div className="flex flex-col gap-6">
        {invitations.length > 0 && (
          <section aria-labelledby="overview-invitations-heading">
            <h2 id="overview-invitations-heading" className="mb-3 text-[17px] font-semibold text-ink">
              You&apos;re invited
            </h2>
            <InvitationResponses invitations={invitations} onResolved={(invitation) => removeInvitation(invitation.id)} />
          </section>
        )}

        {myTasksStatus === "error" && myTasksFailure ? (
          <div className="rounded-[14px] border border-line bg-surface">
            <FailurePanel failure={myTasksFailure} onRetry={reloadMyTasks} />
          </div>
        ) : loading ? (
          <div role="status" aria-label="Loading your overview" className="skeleton h-[180px] rounded-[14px]!" />
        ) : (
          <NextStepCard myTasks={myTasks} workspaceTaskCount={workspaceTasks.tasks.length} now={now} timezone={viewer.timezone} />
        )}

        <GettingStarted
          workspaceId={activeWorkspace?.id ?? ""}
          hasTask={workspaceTasks.status !== "ready" || workspaceTasks.tasks.length > 0}
          hasProject={resourcesStatus !== "ready" || projects.length > 0}
          hasTeammate={resourcesStatus !== "ready" || hasTeammates}
          isManager={isManager}
        />

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
          {/* ─── Your day ───────────────────── */}
          <div className="flex min-w-0 flex-col gap-6">
            <TodayAgenda tasks={myTasks} now={now} timezone={viewer.timezone} loading={loading} />
            <WeekAhead tasks={myTasks} now={now} timezone={viewer.timezone} />

            <section aria-labelledby="workspace-summary-heading" className="rounded-[14px] border border-line bg-surface px-5 py-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 id="workspace-summary-heading" className="text-[15px] font-semibold text-ink">
                  Across {activeWorkspace?.name ?? "the workspace"}
                </h2>
                <p className="text-[13px] text-muted">Top-level tasks, not counting archived projects</p>
              </div>
              {workspaceTasks.status === "error" && workspaceTasks.failure ? (
                <FailurePanel compact failure={workspaceTasks.failure} onRetry={workspaceTasks.reload} />
              ) : (
                <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <SummaryFigure label="Open" value={workspaceCounts?.open} href="/tasks?scope=all&due=open" />
                  <SummaryFigure label="Overdue" value={workspaceCounts?.overdue} href="/tasks?scope=all&due=overdue" danger={!!workspaceCounts?.overdue} />
                  <SummaryFigure label="Completed" value={workspaceCounts?.completed} href="/tasks?scope=all&due=completed" />
                  <SummaryFigure label="Active projects" value={workspaceCounts?.activeProjects} href="/projects" />
                </dl>
              )}
            </section>
          </div>

          {/* ─── The team and the work ───────────────────── */}
          <div className="flex min-w-0 flex-col gap-6">
            {hasTeammates && <TeamPulse tasks={workspaceTasks.tasks} viewerId={user?.id} />}

            <section aria-labelledby="projects-progress-heading" className="rounded-[14px] border border-line bg-surface">
              <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
                <h2 id="projects-progress-heading" className="text-[17px] font-semibold text-ink">
                  Projects
                </h2>
                <Link href="/projects" className="inline-flex items-center gap-1 rounded text-[14px] font-medium text-forest hover:underline">
                  All projects
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
              {resourcesStatus === "loading" ? (
                <div className="flex flex-col gap-3 p-5" role="status" aria-label="Loading projects">
                  {[0, 1].map((index) => (
                    <span key={index} className="skeleton h-12" />
                  ))}
                </div>
              ) : visibleProjects.length === 0 ? (
                <div className="px-5 py-8 text-center text-[15px] text-muted">
                  <FolderKanban size={22} aria-hidden="true" className="mx-auto mb-2 text-forest" />
                  No projects yet.{" "}
                  {isManager ? (
                    <Link href="/projects?new=1" className="font-semibold text-forest hover:underline">
                      Create one
                    </Link>
                  ) : (
                    "An Owner or Admin can create one."
                  )}{" "}
                  Tasks work fine without a project.
                </div>
              ) : (
                <ul className="flex flex-col">
                  {visibleProjects.map((project) => {
                    const percent = project.taskCounts.total ? Math.round((project.taskCounts.completed / project.taskCounts.total) * 100) : null;
                    return (
                      <li key={project.id} className="border-t border-line-soft first:border-t-0">
                        <Link href={`/projects/${project.id}`} className="block px-5 py-3.5 transition-colors hover:bg-surface-muted/60">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="truncate text-[15px] font-medium text-ink">{project.name}</span>
                            <span className="shrink-0 text-[13px] tabular-nums text-muted">
                              {project.taskCounts.total === 0 ? "No tasks yet" : `${project.taskCounts.completed} of ${project.taskCounts.total} done`}
                            </span>
                          </span>
                          {percent !== null && (
                            <span
                              role="progressbar"
                              aria-label={`${project.name} progress`}
                              aria-valuenow={percent}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-muted"
                            >
                              <span className="block h-full rounded-full bg-forest transition-[width] duration-500" style={{ width: `${percent}%` }} />
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-labelledby="recent-activity-heading" className="rounded-[14px] border border-line bg-surface p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h2 id="recent-activity-heading" className="text-[17px] font-semibold text-ink">
                  Recently
                </h2>
                <Link href="/settings/workspace#activity" className="inline-flex items-center gap-1 rounded text-[14px] font-medium text-forest hover:underline">
                  Full history
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
              <ActivityFeed loadPage={loadActivity} limit={6} reloadKey={workspaceTasks.tasks.map((task) => task.version).join()} />
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

function SummaryFigure({ label, value, href, danger = false }: { label: string; value: number | undefined; href: string; danger?: boolean }) {
  return (
    <div>
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd>
        {value === undefined ? (
          <span className="skeleton mt-1 block h-6 w-8" aria-hidden="true" />
        ) : (
          <Link href={href} className={cx("text-[20px] font-semibold tabular-nums hover:underline", danger ? "text-brick" : "text-ink")}>
            {value}
            <span className="sr-only">, view list</span>
          </Link>
        )}
      </dd>
    </div>
  );
}
