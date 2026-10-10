"use client";

// Overview: what needs you, how the workspace is moving, and what changed recently.
// Every number is computed from real task data and links to the exact tasks it counts
// (PRD FR14: "dashboard counts match their drill-down results").
import { useCallback, useMemo } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, CircleDot, FolderKanban, TriangleAlert, CalendarClock, type LucideIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { useWorkspaceResources } from "@/context/WorkspaceResourcesContext";
import { useMyWork } from "@/context/MyWorkContext";
import { useTaskPanels } from "@/context/TaskPanelContext";
import { useWorkspaceTasks } from "@/hooks/useWorkspaceTasks";
import { useStatusChange } from "@/hooks/useStatusChange";
import { useViewer } from "@/hooks/useViewer";
import { useNow } from "@/hooks/useNow";
import { getWorkspaceActivity } from "@/lib/services/activityService";
import { compareByUrgency } from "@/utils/taskBuckets";
import { useDashboard } from "@/hooks/useDashboard";
import { canEditTask } from "@/utils/permissions";
import { cx } from "@/lib/cx";
import PageHeader from "@/components/layout/PageHeader";
import NextStepCard from "@/components/overview/NextStepCard";
import GettingStarted from "@/components/overview/GettingStarted";
import InvitationResponses from "@/components/people/InvitationResponses";
import ActivityFeed from "@/components/activity/ActivityFeed";
import StatusSelect from "@/components/tasks/StatusSelect";
import { DueLabel } from "@/components/ui/Badges";
import { FailurePanel } from "@/components/ui/States";
import { ProjectTag, ParentContext } from "@/components/tasks/TaskMeta";
import type { Task } from "@/types/models";

const greetingFor = (now: Date | null) => {
  if (!now) return "Hello";
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
};

const ROLE_SENTENCES = { owner: "You're the Owner", admin: "You're an Admin", member: "You're a Member" } as const;

const ALL_TOP_LEVEL = {} as const;
const ASSIGNED_LIST_LIMIT = 6;

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
  const personal = dashboard.counts?.personal;
  const workspaceCounts = dashboard.counts?.workspace;

  const assignedPreview = useMemo(() => myTasks.filter((task) => task.status !== "completed").sort(compareByUrgency).slice(0, ASSIGNED_LIST_LIMIT), [myTasks]);
  const openAssignedCount = myTasks.filter((task) => task.status !== "completed").length;

  const workspaceId = activeWorkspace?.id;
  const loadActivity = useCallback((page: { before?: string }) => getWorkspaceActivity(workspaceId, page), [workspaceId]);

  const loading = myTasksStatus === "loading" || workspaceTasks.status === "loading" || !now;
  const firstName = user?.name?.split(" ")[0];
  const visibleProjects = projects.filter((project) => project.state !== "archived").slice(0, 5);

  return (
    <>
      <title>{`Overview · ${activeWorkspace?.name ?? "Afritask"}`}</title>
      <PageHeader
        eyebrow={activeWorkspace ? `${activeWorkspace.name} · ${ROLE_SENTENCES[activeWorkspace.role]}` : undefined}
        title={`${greetingFor(now)}${firstName ? `, ${firstName}` : ""}`}
        description="Here's what needs you, and how the work is moving."
      />

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
          <div role="status" aria-label="Loading your overview" className="skeleton h-[220px] rounded-[14px]!" />
        ) : (
          <NextStepCard myTasks={myTasks} workspaceTaskCount={workspaceTasks.tasks.length} now={now} timezone={viewer.timezone} />
        )}

        {/* Personal counts — each links to exactly the tasks it counts. */}
        <section aria-labelledby="my-counts-heading">
          <h2 id="my-counts-heading" className="sr-only">
            Your work at a glance
          </h2>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile icon={TriangleAlert} label="Overdue" value={personal?.overdue} href="/tasks?due=overdue" tone={personal?.overdue ? "danger" : "neutral"} hint="Past their due time" />
            <StatTile icon={CalendarClock} label="Due today" value={personal?.dueToday} href="/tasks?due=today" hint="On your calendar today" />
            <StatTile icon={CircleDot} label="In progress" value={personal?.inProgress} href="/tasks?status=in_progress" hint="Assigned to you, started" />
            <StatTile icon={CircleCheck} label="Done this week" value={personal?.completedThisWeek} href="/tasks?due=week" hint="Since Monday" />
          </ul>
        </section>

        <GettingStarted
          workspaceId={activeWorkspace?.id ?? ""}
          hasTask={workspaceTasks.status !== "ready" || workspaceTasks.tasks.length > 0}
          hasProject={resourcesStatus !== "ready" || projects.length > 0}
          hasTeammate={resourcesStatus !== "ready" || members.length > 1}
          isManager={isManager}
        />

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          {/* Assigned to me */}
          <section aria-labelledby="assigned-heading" className="rounded-[14px] border border-line bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
              <h2 id="assigned-heading" className="text-[17px] font-semibold text-ink">
                Assigned to you
              </h2>
              <Link href="/tasks" className="inline-flex items-center gap-1 rounded text-[14px] font-medium text-forest hover:underline">
                All {openAssignedCount > 0 ? openAssignedCount : ""} open
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </div>
            {loading ? (
              <div className="flex flex-col gap-3 p-5" role="status" aria-label="Loading assigned tasks">
                {[0, 1, 2].map((index) => (
                  <span key={index} className="skeleton h-12" />
                ))}
              </div>
            ) : assignedPreview.length === 0 ? (
              <p className="px-5 py-8 text-center text-[15px] text-muted">
                Nothing open is assigned to you. When someone assigns you a task — or you assign yourself — it shows up here.
              </p>
            ) : (
              <ul>
                {assignedPreview.map((task) => (
                  <AssignedRow key={task.id} task={task} now={now} />
                ))}
              </ul>
            )}
          </section>

          {/* Projects */}
          <section aria-labelledby="projects-progress-heading" className="rounded-[14px] border border-line bg-surface">
            <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
              <h2 id="projects-progress-heading" className="text-[17px] font-semibold text-ink">
                Project progress
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
                      <Link href={`/projects/${project.id}`} className="block px-5 py-3.5 hover:bg-surface-muted/60">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[15px] font-medium text-ink">{project.name}</span>
                          <span className="shrink-0 text-[13px] text-muted">
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
                            <span className="block h-full rounded-full bg-forest" style={{ width: `${percent}%` }} />
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Workspace summary + activity */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <section aria-labelledby="workspace-summary-heading" className="rounded-[14px] border border-line bg-surface p-5">
            <h2 id="workspace-summary-heading" className="text-[17px] font-semibold text-ink">
              Across the workspace
            </h2>
            <p className="mt-0.5 text-[14px] text-muted">Top-level tasks, not counting archived projects.</p>
            {workspaceTasks.status === "error" && workspaceTasks.failure ? (
              <FailurePanel compact failure={workspaceTasks.failure} onRetry={workspaceTasks.reload} />
            ) : (
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
                <SummaryFigure label="Open tasks" value={workspaceCounts?.open} href="/tasks?scope=all&due=open" />
                <SummaryFigure label="Overdue" value={workspaceCounts?.overdue} href="/tasks?scope=all&due=overdue" danger={!!workspaceCounts?.overdue} />
                <SummaryFigure label="Completed" value={workspaceCounts?.completed} href="/tasks?scope=all&due=completed" />
                <SummaryFigure label="Active projects" value={workspaceCounts?.activeProjects} href="/projects" />
              </dl>
            )}
          </section>

          <section aria-labelledby="recent-activity-heading" className="rounded-[14px] border border-line bg-surface p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 id="recent-activity-heading" className="text-[17px] font-semibold text-ink">
                Recent activity
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
    </>
  );
}

function StatTile({ icon: Icon, label, value, href, hint, tone = "neutral" }: { icon: LucideIcon; label: string; value: number | undefined; href: string; hint: string; tone?: "neutral" | "danger" }) {
  return (
    <li>
      <Link
        href={href}
        className={cx(
          "group flex h-full flex-col gap-1 rounded-[14px] border bg-surface p-4 transition-[border-color,box-shadow] hover:shadow-md",
          tone === "danger" ? "border-brick/40" : "border-line hover:border-forest/40"
        )}
      >
        <span className={cx("flex items-center gap-2 text-[14px] font-medium", tone === "danger" ? "text-brick" : "text-muted")}>
          <Icon size={16} aria-hidden="true" />
          {label}
        </span>
        {value === undefined ? (
          <span className="skeleton mt-1 h-8 w-10" aria-hidden="true" />
        ) : (
          <span className={cx("text-[30px] font-semibold leading-tight tabular-nums", tone === "danger" ? "text-brick" : "text-ink")}>{value}</span>
        )}
        <span className="text-[13px] text-muted">
          {hint}
          <span className="sr-only">. Open these tasks.</span>
        </span>
      </Link>
    </li>
  );
}

function SummaryFigure({ label, value, href, danger = false }: { label: string; value: number | undefined; href: string; danger?: boolean }) {
  return (
    <div>
      <dt className="text-[14px] text-muted">{label}</dt>
      <dd>
        {value === undefined ? (
          <span className="skeleton mt-1 block h-7 w-10" aria-hidden="true" />
        ) : (
          <Link href={href} className={cx("text-[24px] font-semibold tabular-nums hover:underline", danger ? "text-brick" : "text-ink")}>
            {value}
            <span className="sr-only"> — view</span>
          </Link>
        )}
      </dd>
    </div>
  );
}

function AssignedRow({ task, now }: { task: Task; now: Date | null }) {
  const { openTask } = useTaskPanels();
  const changeStatus = useStatusChange();
  const viewer = useViewer();
  return (
    <li className="flex flex-col gap-2 border-t border-line-soft px-5 py-3.5 first:border-t-0 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <button type="button" onClick={() => openTask(task.id)} className="cursor-pointer rounded text-left text-[15px] font-medium text-ink hover:underline">
          {task.title}
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <ParentContext task={task} />
          <ProjectTag task={task} />
          <DueLabel task={task} now={now} />
        </div>
      </div>
      <StatusSelect status={task.status} taskTitle={task.title} disabled={!canEditTask(viewer, task)} onChange={(nextStatus) => changeStatus(task, nextStatus)} />
    </li>
  );
}
