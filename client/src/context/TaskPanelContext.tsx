/**
 * Opens the task surfaces from anywhere in the workspace:
 *  - the task drawer, addressed by `?task=<id>` in the URL so a refresh, the back button
 *    and links from Notifications all reopen the same task;
 *  - the comments panel, `?comments=<id>`: the task's thread on its own, so people can
 *    comment or reply without going through the task's settings;
 *  - the "New task" composer, with optional defaults (e.g. the project you're looking at).
 */
"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import TaskComposer from "@/components/tasks/TaskComposer";
import TaskDrawer from "@/components/tasks/TaskDrawer";
import TaskDiscussion from "@/components/tasks/TaskDiscussion";

export interface ComposerDefaults {
  projectId?: string;
}

interface TaskPanels {
  openTask: (taskId: string) => void;
  openComments: (taskId: string) => void;
  closeTask: () => void;
  openComposer: (defaults?: ComposerDefaults) => void;
}

const TaskPanelContext = createContext<TaskPanels | null>(null);

export function TaskPanelProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openTaskId = searchParams.get("task");
  const commentsTaskId = searchParams.get("comments");
  const panelOpen = !!(openTaskId || commentsTaskId);
  const [composer, setComposer] = useState<{ open: boolean; defaults: ComposerDefaults }>({ open: false, defaults: {} });

  // Built from window.location at call time so other params (filters, view) are never lost.
  // Only one panel is open at a time, so setting one clears the other.
  const withPanelParam = useCallback(
    (panel: "task" | "comments" | null, taskId?: string) => {
      const nextParams = new URLSearchParams(window.location.search);
      nextParams.delete("task");
      nextParams.delete("comments");
      if (panel && taskId) nextParams.set(panel, taskId);
      const query = nextParams.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [pathname]
  );

  // Opening pushes (Back closes the drawer); moving between tasks inside it replaces.
  // NOTE: native history calls (see useTaskFilters) — opening a drawer needs no server
  // round-trip, and router navigations issued during page load could be dropped.
  const openPanel = useCallback(
    (panel: "task" | "comments", taskId: string) => {
      if (panelOpen) window.history.replaceState(null, "", withPanelParam(panel, taskId));
      else window.history.pushState(null, "", withPanelParam(panel, taskId));
    },
    [withPanelParam, panelOpen]
  );
  const openTask = useCallback((taskId: string) => openPanel("task", taskId), [openPanel]);
  const openComments = useCallback((taskId: string) => openPanel("comments", taskId), [openPanel]);

  const closeTask = useCallback(() => {
    window.history.replaceState(null, "", withPanelParam(null));
  }, [withPanelParam]);

  const openComposer = useCallback((defaults: ComposerDefaults = {}) => {
    setComposer({ open: true, defaults });
  }, []);

  const value = useMemo(() => ({ openTask, openComments, closeTask, openComposer }), [openTask, openComments, closeTask, openComposer]);

  return (
    <TaskPanelContext.Provider value={value}>
      {children}
      <TaskComposer
        open={composer.open}
        defaults={composer.defaults}
        onClose={() => setComposer((current) => ({ ...current, open: false }))}
      />
      {openTaskId && <TaskDrawer key={openTaskId} taskId={openTaskId} onClose={closeTask} onOpenTask={openTask} />}
      {!openTaskId && commentsTaskId && (
        <TaskDiscussion key={commentsTaskId} taskId={commentsTaskId} onClose={closeTask} onOpenTask={openTask} onOpenComments={openComments} />
      )}
    </TaskPanelContext.Provider>
  );
}

export function useTaskPanels(): TaskPanels {
  const context = useContext(TaskPanelContext);
  if (!context) throw new Error("useTaskPanels must be used within a TaskPanelProvider");
  return context;
}
