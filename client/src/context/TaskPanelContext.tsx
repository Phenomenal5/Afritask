/**
 * Opens the two task surfaces from anywhere in the workspace:
 *  - the task drawer, addressed by `?task=<id>` in the URL so a refresh, the back button
 *    and links from Notifications all reopen the same task;
 *  - the "New task" composer, with optional defaults (e.g. the project you're looking at).
 */
"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import TaskComposer from "@/components/tasks/TaskComposer";
import TaskDrawer from "@/components/tasks/TaskDrawer";

export interface ComposerDefaults {
  projectId?: string;
}

interface TaskPanels {
  openTask: (taskId: string) => void;
  closeTask: () => void;
  openComposer: (defaults?: ComposerDefaults) => void;
}

const TaskPanelContext = createContext<TaskPanels | null>(null);

export function TaskPanelProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openTaskId = searchParams.get("task");
  const [composer, setComposer] = useState<{ open: boolean; defaults: ComposerDefaults }>({ open: false, defaults: {} });

  // Built from window.location at call time so other params (filters, view) are never lost.
  const withTaskParam = useCallback(
    (taskId: string | null) => {
      const nextParams = new URLSearchParams(window.location.search);
      if (taskId) nextParams.set("task", taskId);
      else nextParams.delete("task");
      const query = nextParams.toString();
      return query ? `${pathname}?${query}` : pathname;
    },
    [pathname]
  );

  // Opening pushes (Back closes the drawer); moving between tasks inside it replaces.
  // NOTE: native history calls (see useTaskFilters) — opening a drawer needs no server
  // round-trip, and router navigations issued during page load could be dropped.
  const openTask = useCallback(
    (taskId: string) => {
      if (openTaskId) window.history.replaceState(null, "", withTaskParam(taskId));
      else window.history.pushState(null, "", withTaskParam(taskId));
    },
    [withTaskParam, openTaskId]
  );

  const closeTask = useCallback(() => {
    window.history.replaceState(null, "", withTaskParam(null));
  }, [withTaskParam]);

  const openComposer = useCallback((defaults: ComposerDefaults = {}) => {
    setComposer({ open: true, defaults });
  }, []);

  const value = useMemo(() => ({ openTask, closeTask, openComposer }), [openTask, closeTask, openComposer]);

  return (
    <TaskPanelContext.Provider value={value}>
      {children}
      <TaskComposer
        open={composer.open}
        defaults={composer.defaults}
        onClose={() => setComposer((current) => ({ ...current, open: false }))}
      />
      {openTaskId && <TaskDrawer key={openTaskId} taskId={openTaskId} onClose={closeTask} onOpenTask={openTask} />}
    </TaskPanelContext.Provider>
  );
}

export function useTaskPanels(): TaskPanels {
  const context = useContext(TaskPanelContext);
  if (!context) throw new Error("useTaskPanels must be used within a TaskPanelProvider");
  return context;
}
