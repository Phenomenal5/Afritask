/**
 * "What needs me": tasks assigned to me in the active workspace (including separately
 * assigned subtasks — PRD FR11) and invitations addressed to me. Loaded once by the app
 * shell and shared by the sidebar badge, Overview, My Tasks and Notifications.
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getMyInvitations } from "@/lib/services/invitationService";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { useWorkspaceTasks, type LoadStatus } from "@/hooks/useWorkspaceTasks";
import { useNow } from "@/hooks/useNow";
import { useViewer } from "@/hooks/useViewer";
import { dueBucketOf } from "@/utils/taskBuckets";
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
  // Invitations + overdue: what the Notifications badge counts.
  attentionCount: number;
}

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
      const res = await getMyInvitations();
      setInvitations(res.data.data.invitations);
      setInvitationsStatus("ready");
    } catch {
      setInvitationsStatus("error");
    }
  }, []);

  useEffect(() => {
    reloadInvitations();
  }, [reloadInvitations]);

  const removeInvitation = useCallback((invitationId: string) => {
    setInvitations((current) => current.filter((invitation) => invitation.id !== invitationId));
  }, []);

  const value = useMemo<MyWork>(() => {
    const buckets = now ? tasks.map((task) => dueBucketOf(task, now, timezone)) : [];
    const overdueCount = buckets.filter((bucket) => bucket === "overdue").length;
    const dueTodayCount = buckets.filter((bucket) => bucket === "today").length;
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
    };
  }, [tasks, status, failure, reload, invitations, invitationsStatus, reloadInvitations, removeInvitation, now, timezone]);

  return <MyWorkContext.Provider value={value}>{children}</MyWorkContext.Provider>;
}

export function useMyWork(): MyWork {
  const ctx = useContext(MyWorkContext);
  if (!ctx) throw new Error("useMyWork must be used within a MyWorkProvider");
  return ctx;
}
