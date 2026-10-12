"use client";

// Notifications: the account's in-app inbox (assignments, mentions, invitations — across
// all workspaces), then what needs you in this workspace right now (invitations waiting,
// overdue and due-today work). Opening an item re-checks access: a deleted task or a
// workspace you've left shows why it can't open instead of its content.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  AlarmClock,
  LifeBuoy,
  AtSign,
  BellOff,
  CalendarClock,
  CheckCheck,
  CircleSlash,
  Mail,
  TriangleAlert,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { useMyWork } from "@/context/MyWorkContext";
import { useTaskPanels } from "@/context/TaskPanelContext";
import { useViewer } from "@/hooks/useViewer";
import { useNow } from "@/hooks/useNow";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "@/lib/services/notificationService";
import { describeFailure, failureMessage, type Failure } from "@/lib/errors";
import { compareByUrgency, dueBucketOf } from "@/utils/taskBuckets";
import { describeDue } from "@/utils/taskMeta";
import { timeAgo } from "@/utils/activity";
import { cx } from "@/lib/cx";
import PageHeader from "@/components/layout/PageHeader";
import InvitationResponses from "@/components/people/InvitationResponses";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badges";
import { EmptyState, FailurePanel, SkeletonRows } from "@/components/ui/States";
import { ParentContext, ProjectTag } from "@/components/tasks/TaskMeta";
import type { AppNotification, Invitation, Task } from "@/types/models";

type InboxFilter = "all" | "unread";

const TYPE_META: Record<AppNotification["type"], { icon: LucideIcon; label: string }> = {
  task_assigned: { icon: UserRoundCheck, label: "Assignment" },
  comment_mention: { icon: AtSign, label: "Mention" },
  invitation_received: { icon: Mail, label: "Invitation" },
  task_reminder: { icon: AlarmClock, label: "Reminder" },
  task_overdue: { icon: TriangleAlert, label: "Overdue" },
  task_starting: { icon: CalendarClock, label: "Starting soon" },
  support_reply: { icon: LifeBuoy, label: "Support" },
};

// One sentence that says what happened and why it matters to you.
function describeNotification(notification: AppNotification): ReactNode {
  const actor = notification.actor?.name ?? "Someone";
  const subject = notification.summary ? <strong className="font-semibold">“{notification.summary}”</strong> : "a task";
  switch (notification.type) {
    case "task_assigned":
      return <>{actor} assigned you {subject}. You&apos;re now responsible for moving it forward.</>;
    case "comment_mention":
      return <>{actor} mentioned you in a comment on {subject}.</>;
    case "task_reminder":
      return <>Reminder: {subject} is due soon.</>;
    case "task_starting":
      return <>{subject} is planned to start tomorrow. A good moment to get ready.</>;
    case "task_overdue":
      return <>{subject} has passed its due time and is still open. Finish it, move the date, or hand it to someone else.</>;
    case "support_reply":
      return <>Afritask support replied to your request {subject}.</>;
    case "invitation_received":
      return (
        <>
          {actor} invited you to join <strong className="font-semibold">{notification.summary || "a workspace"}</strong>. You only become a member if you
          accept.
        </>
      );
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const { activeWorkspace, switchWorkspace, workspaces } = useWorkspaces();
  const { myTasks, myTasksStatus, myTasksFailure, reloadMyTasks, invitations, invitationsStatus, removeInvitation, setUnreadNotifications } = useMyWork();
  const { openTask, openComments } = useTaskPanels();
  const { timezone } = useViewer();
  const now = useNow();

  // ─── Inbox ─────────────────────
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [inboxFailure, setInboxFailure] = useState<Failure | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  const loadInbox = useCallback(async () => {
    try {
      const response = await getNotifications({ unread: filter === "unread" });
      setNotifications(response.data.data.notifications);
      setNextCursor(response.data.data.nextCursor);
      setUnreadNotifications(response.data.data.unreadCount);
      setInboxFailure(null);
    } catch (error) {
      setInboxFailure(describeFailure(error, "Couldn't load your notifications."));
    }
  }, [filter, setUnreadNotifications]);

  useEffect(() => {
    setNotifications(null);
    loadInbox();
  }, [loadInbox]);

  const loadOlder = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const response = await getNotifications({ unread: filter === "unread", before: nextCursor });
      setNotifications((current) => [...(current ?? []), ...response.data.data.notifications]);
      setNextCursor(response.data.data.nextCursor);
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't load older notifications."));
    } finally {
      setLoadingMore(false);
    }
  };

  const markRead = async (notification: AppNotification) => {
    if (notification.readAt) return;
    // Show it read straight away; restore if the server refuses.
    setNotifications((current) => (current ?? []).map((item) => (item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item)));
    try {
      const response = await markNotificationRead(notification.id);
      setUnreadNotifications(response.data.data.unreadCount);
    } catch (error) {
      setNotifications((current) => (current ?? []).map((item) => (item.id === notification.id ? notification : item)));
      toast.error(failureMessage(error, "Couldn't mark that as read."));
    }
  };

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      setUnreadNotifications(0);
      toast.success("All caught up");
      await loadInbox();
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't mark everything as read."));
    } finally {
      setMarkingAll(false);
    }
  };

  const open = (notification: AppNotification) => {
    markRead(notification);
    if (notification.type === "support_reply" && notification.supportTicketId) {
      router.push(`/support?ticket=${notification.supportTicketId}`);
      return;
    }
    if (notification.type === "invitation_received") {
      document.getElementById("waiting-invitations")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (!notification.taskId) return;
    // A notification can come from another workspace you belong to: switch first, so the
    // task opens in its own context. The drawer re-checks access when it loads.
    const targetWorkspaceId = notification.workspace?.id;
    if (targetWorkspaceId && targetWorkspaceId !== activeWorkspace?.id && workspaces.some((workspace) => workspace.id === targetWorkspaceId)) {
      switchWorkspace(targetWorkspaceId);
    }
    // A mention is about the conversation: open the comments, not the task's settings.
    if (notification.type === "comment_mention") openComments(notification.taskId);
    else openTask(notification.taskId);
  };

  // A push notification links to /notifications?open=<id>: open that one once the inbox has
  // loaded — the same as clicking it here (switches workspace, opens the task).
  const openedFromLinkRef = useRef(false);
  useEffect(() => {
    if (openedFromLinkRef.current || !notifications) return;
    const requestedId = new URLSearchParams(window.location.search).get("open");
    if (!requestedId) return;
    openedFromLinkRef.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    const requested = notifications.find((notification) => notification.id === requestedId);
    if (requested?.available) open(requested);
  }, [notifications]);

  const hasUnread = (notifications ?? []).some((notification) => !notification.readAt);

  // ─── Also needs you (this workspace) ─────────────────────
  const attention = useMemo(() => {
    if (!now) return { overdue: [] as Task[], today: [] as Task[] };
    const sorted = [...myTasks].sort(compareByUrgency);
    return {
      overdue: sorted.filter((task) => dueBucketOf(task, now, timezone) === "overdue"),
      today: sorted.filter((task) => dueBucketOf(task, now, timezone) === "today"),
    };
  }, [myTasks, now, timezone]);
  const attentionLoading = myTasksStatus === "loading" || invitationsStatus === "loading" || !now;

  return (
    <>
      <title>Notifications · Afritask</title>
      <PageHeader
        eyebrow={activeWorkspace?.name}
        title="Notifications"
        description="What happened that involves you, and what needs you next. Each item links straight to the work."
        actions={
          hasUnread && (
            <Button variant="secondary" icon={<CheckCheck size={17} aria-hidden="true" />} loading={markingAll} onClick={markAll}>
              Mark all as read
            </Button>
          )
        }
      />

      <section aria-labelledby="inbox-heading" className="mb-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="inbox-heading" className="text-[17px] font-semibold text-ink">
            Inbox
          </h2>
          <div role="group" aria-label="Show" className="inline-flex rounded-[10px] border border-line bg-surface p-1">
            {(["all", "unread"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={filter === option}
                onClick={() => setFilter(option)}
                className={cx(
                  "h-9 cursor-pointer rounded-[8px] px-3 text-[14px] font-medium",
                  filter === option ? "bg-forest text-on-forest" : "text-muted hover:text-ink"
                )}
              >
                {option === "all" ? "All" : "Unread"}
              </button>
            ))}
          </div>
        </div>

        {inboxFailure ? (
          <FailurePanel compact failure={inboxFailure} onRetry={loadInbox} />
        ) : notifications === null ? (
          <SkeletonRows rows={3} label="Loading notifications" />
        ) : notifications.length === 0 ? (
          <div className="rounded-[14px] border border-line bg-surface">
            <EmptyState
              compact
              icon={filter === "unread" ? CheckCheck : BellOff}
              title={filter === "unread" ? "You're all caught up" : "No notifications yet"}
              body={
                filter === "unread"
                  ? "Nothing unread. Earlier notifications are under All."
                  : "You'll hear here when someone assigns you a task, mentions you, invites you to a workspace, or a task's reminder or deadline arrives."
              }
            />
          </div>
        ) : (
          <>
            <ul className="overflow-hidden rounded-[14px] border border-line bg-surface">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  now={now}
                  onOpen={open}
                  onMarkRead={markRead}
                  invitation={notification.type === "invitation_received" ? invitations.find((invitation) => invitation.id === notification.invitationId) : undefined}
                  onInvitationResolved={(invitation) => {
                    removeInvitation(invitation.id);
                    markRead(notification);
                  }}
                />
              ))}
            </ul>
            {nextCursor && (
              <div className="mt-3">
                <Button variant="secondary" loading={loadingMore} onClick={loadOlder}>
                  Show older
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="needs-you-heading">
        <h2 id="needs-you-heading" className="mb-1 text-[17px] font-semibold text-ink">
          Also needs you
        </h2>
        <p className="mb-4 text-[14px] text-muted">Invitations waiting for an answer, and your work in {activeWorkspace?.name ?? "this workspace"} that is overdue or due today.</p>

        {attentionLoading ? (
          <SkeletonRows rows={2} label="Loading what needs you" />
        ) : invitations.length === 0 && attention.overdue.length === 0 && attention.today.length === 0 && myTasksStatus !== "error" ? (
          <p className="rounded-[14px] border border-line bg-surface px-5 py-4 text-[15px] text-muted">
            Nothing is overdue or due today, and no invitations are waiting.{" "}
            <Link href="/tasks?due=upcoming" className="font-medium text-forest underline underline-offset-2">
              See what&apos;s coming up
            </Link>
          </p>
        ) : (
          <div className="flex flex-col gap-8">
            {invitations.length > 0 && (
              <div id="waiting-invitations" className="scroll-mt-24">
                <NotificationGroup icon={Mail} title="Invitations" why="Someone wants you in their workspace. You only become a member if you accept.">
                  <InvitationResponses invitations={invitations} onResolved={(invitation) => removeInvitation(invitation.id)} />
                </NotificationGroup>
              </div>
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
                  <NotificationGroup icon={CalendarClock} title={`Due today (${attention.today.length})`} why="Still on time. These are due before the end of today.">
                    <AttentionList tasks={attention.today} now={now} kind="today" />
                  </NotificationGroup>
                )}
              </>
            )}
          </div>
        )}
      </section>
    </>
  );
}

// ─── One inbox row ─────────────────────
function NotificationItem({
  notification,
  now,
  onOpen,
  onMarkRead,
  invitation,
  onInvitationResolved,
}: {
  notification: AppNotification;
  now: Date | null;
  onOpen: (notification: AppNotification) => void;
  onMarkRead: (notification: AppNotification) => void;
  // invitation_received only: the still-open invitation, answered right here.
  invitation?: Invitation;
  onInvitationResolved: (invitation: Invitation) => void;
}) {
  const meta = TYPE_META[notification.type];
  const Icon = notification.available ? meta.icon : CircleSlash;
  const isUnread = !notification.readAt;
  // An open invitation is answered in place (Accept / Decline below) rather than opened.
  const answerInPlace = notification.type === "invitation_received" && !!invitation;
  const canOpen = notification.available && !answerInPlace && (notification.type === "invitation_received" || !!notification.taskId || !!notification.supportTicketId);

  return (
    <li
      className={cx(
        "relative flex gap-3 border-t border-line-soft px-4 py-4 first:border-t-0 sm:px-5",
        isUnread && "bg-lime/25",
        canOpen && "cursor-pointer transition-colors hover:bg-surface-muted/70"
      )}
    >
      <span className="relative mt-0.5 shrink-0">
        {notification.actor ? <Avatar user={notification.actor} size={36} /> : <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-muted" />}
        <span className="absolute -bottom-1 -right-1 inline-flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-forest">
          <Icon size={12} aria-hidden="true" />
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-muted">
          {isUnread && (
            <span className="inline-flex items-center gap-1 font-semibold text-forest">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-brick" />
              Unread
            </span>
          )}
          <span>{meta.label}</span>
          {notification.workspace && <span>· {notification.workspace.name}</span>}
          <span>·</span>
          <time dateTime={notification.createdAt} title={new Date(notification.createdAt).toLocaleString()}>
            {now ? timeAgo(notification.createdAt, now) : new Date(notification.createdAt).toLocaleDateString()}
          </time>
        </p>

        <p className={cx("mt-1 text-[15px] leading-snug", notification.available ? "text-ink" : "text-muted")}>
          {notification.available ? describeNotification(notification) : `${meta.label}: ${notification.unavailableReason ?? "This item can't be opened."}`}
        </p>

        <div className="mt-2 flex flex-wrap gap-2">
          {answerInPlace && invitation && (
            <div className="relative z-10 w-full">
              <InvitationResponses invitations={[invitation]} onResolved={(resolved) => onInvitationResolved(resolved)} />
            </div>
          )}
          {canOpen && (
            <Button
              size="sm"
              variant={isUnread ? "primary" : "secondary"}
              onClick={() => onOpen(notification)}
              className="after:absolute after:inset-0 after:content-['']"
            >
              {notification.type === "invitation_received"
                ? "Respond"
                : notification.type === "support_reply"
                  ? "Read reply"
                  : notification.type === "comment_mention"
                    ? "Open comment"
                    : "Open task"}
            </Button>
          )}
          {isUnread && (
            <Button size="sm" variant="ghost" onClick={() => onMarkRead(notification)} className="relative z-10">
              Mark as read
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

function NotificationGroup({ icon: Icon, title, why, tone = "neutral", children }: { icon: LucideIcon; title: string; why: string; tone?: "neutral" | "danger"; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className={`flex items-center gap-2 text-[16px] font-semibold ${tone === "danger" ? "text-brick" : "text-ink"}`}>
        <Icon size={19} aria-hidden="true" />
        {title}
      </h3>
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
