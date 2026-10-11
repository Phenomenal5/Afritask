/**
 * "What needs me": tasks assigned to me in the active workspace (including separately
 * assigned subtasks — PRD FR11) and invitations addressed to me. Loaded once by the app
 * shell and shared by the sidebar badge, Overview, My Tasks and Notifications.
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getMyInvitations } from "@/lib/services/invitationService";
import { getUnreadNotificationCount } from "@/lib/services/notificationService";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { useWorkspaceTasks, type LoadStatus } from "@/hooks/useWorkspaceTasks";
import { useNow } from "@/hooks/useNow";
import { useViewer } from "@/hooks/useViewer";
import { isDueToday, isOverdue } from "@/utils/taskBuckets";
import type { Failure } from "@/lib/errors";
import type { Invitation, Task } from "@/types/models";

interface MyWork {
  myTasks: Task[];
  myTasksStatus: LoadStatus;
  myTasksFailure: Failure | null;
  reloadMyTasks: () => void;
  invitations: Invitation[];
  invitationsStatus: LoadStatus;
  reloadInvitations: () => Promise<void>;
  removeInvitation: (invitationId: string) => void;
  overdueCount: number;
  dueTodayCount: number;
  // Invitations + overdue: what Notifications lists under "Also needs you".
  attentionCount: number;
  // The server's unread in-app notifications (all workspaces) — the bell badge.
  unreadNotifications: number;
  refreshUnreadNotifications: () => Promise<void>;
  setUnreadNotifications: (count: number) => void;
}

// How often the bell re-checks while the tab is open. Also refreshed on tab focus.
const UNREAD_POLL_MS = 60_000;

const MyWorkContext = createContext<MyWork | null>(null);

const ASSIGNED_TO_ME = { assignee: "me" } as const;

export function MyWorkProvider({ children }: { children: ReactNode }) {
  const { activeWorkspace } = useWorkspaces();
  const { timezone } = useViewer();
  const now = useNow();
  const { tasks, status, failure, reload } = useWorkspaceTasks(activeWorkspace?.id, ASSIGNED_TO_ME);

  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invitationsStatus, setInvitationsStatus] = useState<LoadStatus>("loading");

  const reloadInvitations = useCallback(async () => {
    try {
      const response = await getMyInvitations();
      setInvitations(response.data.data.invitations);
      setInvitationsStatus("ready");
    } catch {
      setInvitationsStatus("error");
    }
  }, []);

  useEffect(() => {
    reloadInvitations();
  }, [reloadInvitations]);

  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const refreshUnreadNotifications = useCallback(async () => {
    try {
      const response = await getUnreadNotificationCount();
      setUnreadNotifications(response.data.data.unreadCount);
    } catch {
      // Keep the last known count; the next poll tries again.
    }
  }, []);

  useEffect(() => {
    refreshUnreadNotifications();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshUnreadNotifications();
    }, UNREAD_POLL_MS);
    window.addEventListener("focus", refreshUnreadNotifications);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshUnreadNotifications);
    };
  }, [refreshUnreadNotifications]);

  const removeInvitation = useCallback((invitationId: string) => {
    setInvitations((current) => current.filter((invitation) => invitation.id !== invitationId));
  }, []);

  const value = useMemo<MyWork>(() => {
    const overdueCount = now ? tasks.filter((task) => isOverdue(task, now)).length : 0;
    const dueTodayCount = now ? tasks.filter((task) => isDueToday(task, now, timezone)).length : 0;
    return {
      myTasks: tasks,
      myTasksStatus: status,
      myTasksFailure: failure,
      reloadMyTasks: reload,
      invitations,
      invitationsStatus,
      reloadInvitations,
      removeInvitation,
      overdueCount,
      dueTodayCount,
      attentionCount: invitations.length + overdueCount,
      unreadNotifications,
      refreshUnreadNotifications,
      setUnreadNotifications,
    };
  }, [tasks, status, failure, reload, invitations, invitationsStatus, reloadInvitations, removeInvitation, now, timezone, unreadNotifications, refreshUnreadNotifications]);

  return <MyWorkContext.Provider value={value}>{children}</MyWorkContext.Provider>;
}

export function useMyWork(): MyWork {
  const context = useContext(MyWorkContext);
  if (!context) throw new Error("useMyWork must be used within a MyWorkProvider");
  return context;
}
