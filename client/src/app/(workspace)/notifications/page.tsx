"use client";

// Notifications. The server has no notification inbox yet (no endpoint for assignment or
// mention alerts, and no read/unread state), so this page does NOT fake one. It gathers
// what genuinely needs you from data that exists — invitations addressed to you and your
// overdue / due-today tasks — explains why each matters, and links straight to it.
import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { CalendarClock, CheckCheck, Info, Mail, TriangleAlert, type LucideIcon } from "lucide-react";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { useMyWork } from "@/context/MyWorkContext";
import { useTaskPanels } from "@/context/TaskPanelContext";
import { useViewer } from "@/hooks/useViewer";
import { useNow } from "@/hooks/useNow";
import { compareByUrgency, dueBucketOf } from "@/utils/taskBuckets";
import { describeDue } from "@/utils/taskMeta";
import PageHeader from "@/components/layout/PageHeader";
import InvitationResponses from "@/components/people/InvitationResponses";
import { StatusBadge } from "@/components/ui/Badges";
import { EmptyState, FailurePanel, Notice, SkeletonRows } from "@/components/ui/States";
import { ParentContext, ProjectTag } from "@/components/tasks/TaskMeta";
import type { Task } from "@/types/models";

export default function NotificationsPage() {
  const { activeWorkspace } = useWorkspaces();
  const { myTasks, myTasksStatus, myTasksFailure, reloadMyTasks, invitations, invitationsStatus, removeInvitation } = useMyWork();
  const { timezone } = useViewer();
  const now = useNow();

  const attention = useMemo(() => {
    if (!now) return { overdue: [] as Task[], today: [] as Task[] };
    const sorted = [...myTasks].sort(compareByUrgency);
    return {
      overdue: sorted.filter((task) => dueBucketOf(task, now, timezone) === "overdue"),
      today: sorted.filter((task) => dueBucketOf(task, now, timezone) === "today"),
    };
  }, [myTasks, now, timezone]);

  const loading = myTasksStatus === "loading" || invitationsStatus === "loading" || !now;
  const nothingNeedsYou = !loading && invitations.length === 0 && attention.overdue.length === 0 && attention.today.length === 0;

  return (
    <>
      <title>Notifications · Afritask</title>
      <PageHeader
        eyebrow={activeWorkspace?.name}
        title="Notifications"
        description="What needs you right now, and why. Each item links straight to the work."
      />

      <Notice icon={Info} tone="neutral" className="mb-6">
        <p>
          <strong>A full notification inbox isn&apos;t available yet.</strong> Alerts for new assignments and mentions, with read and unread
          tracking, need server support that Afritask doesn&apos;t have yet. Until then, this page lists your invitations and your tasks that
          are overdue or due today. The server also emails you a daily reminder for tasks due the next day.
        </p>
      </Notice>

      {loading ? (
        <SkeletonRows rows={3} label="Loading what needs you" />
      ) : nothingNeedsYou ? (
        <div className="rounded-[14px] border border-line bg-surface">
          <EmptyState
            icon={CheckCheck}
            title="Nothing needs you right now"
            body="No invitations are waiting, and none of your tasks are overdue or due today. When that changes, it will show up here and in the sidebar badge."
            action={
              <Link href="/tasks?due=upcoming" className="inline-flex h-11 items-center rounded-[10px] border border-line bg-surface px-4 text-[15px] font-medium text-ink hover:bg-surface-muted">
                See what&apos;s coming up
              </Link>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {invitations.length > 0 && (
            <NotificationGroup icon={Mail} title="Invitations" why="Someone wants you in their workspace. You only become a member if you accept.">
              <InvitationResponses invitations={invitations} onResolved={(invitation) => removeInvitation(invitation.id)} />
            </NotificationGroup>
          )}

          {myTasksStatus === "error" && myTasksFailure ? (
            <FailurePanel compact failure={myTasksFailure} onRetry={reloadMyTasks} />
          ) : (
            <>
              {attention.overdue.length > 0 && (
                <NotificationGroup
                  icon={TriangleAlert}
                  tone="danger"
                  title={`Overdue (${attention.overdue.length})`}
                  why="You're the assignee and the due time has passed. Finish it, move the date, or hand it to someone else."
                >
                  <AttentionList tasks={attention.overdue} now={now} kind="overdue" />
                </NotificationGroup>
              )}
              {attention.today.length > 0 && (
                <NotificationGroup icon={CalendarClock} title={`Due today (${attention.today.length})`} why="Still on time — these are due before the end of today.">
                  <AttentionList tasks={attention.today} now={now} kind="today" />
                </NotificationGroup>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

function NotificationGroup({ icon: Icon, title, why, tone = "neutral", children }: { icon: LucideIcon; title: string; why: string; tone?: "neutral" | "danger"; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className={`flex items-center gap-2 text-[17px] font-semibold ${tone === "danger" ? "text-brick" : "text-ink"}`}>
        <Icon size={19} aria-hidden="true" />
        {title}
      </h2>
      <p className="mb-3 mt-0.5 text-[14px] text-muted">{why}</p>
      {children}
    </section>
  );
}

function AttentionList({ tasks, now, kind }: { tasks: Task[]; now: Date | null; kind: "overdue" | "today" }) {
  const { openTask } = useTaskPanels();
  return (
    <ul className="overflow-hidden rounded-[14px] border border-line bg-surface">
      {tasks.map((task) => {
        const due = now ? describeDue(task, now) : null;
        return (
          <li key={task.id} className="border-t border-line-soft first:border-t-0">
            <button type="button" onClick={() => openTask(task.id)} className="flex w-full cursor-pointer flex-col gap-1.5 px-5 py-4 text-left hover:bg-surface-muted/60 sm:flex-row sm:items-center sm:gap-4">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium text-ink">{task.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={`text-[13.5px] ${kind === "overdue" ? "font-semibold text-brick" : "text-muted"}`}>
                    {kind === "overdue" ? `Was due ${due?.label ?? ""}` : `Due ${due?.label ?? "today"}`}
                  </span>
                  <ParentContext task={task} />
                  <ProjectTag task={task} />
                </span>
              </span>
              <StatusBadge status={task.status} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
