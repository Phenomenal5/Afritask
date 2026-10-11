"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAllTasks } from "@/lib/services/taskService";
import { describeFailure, type Failure } from "@/lib/errors";
import { useTaskActions } from "@/context/TaskContext";
import type { Task, TaskServerQuery } from "@/types/models";

export type LoadStatus = "loading" | "ready" | "error";

interface WorkspaceTasks {
  tasks: Task[];
  status: LoadStatus;
  failure: Failure | null;
  reload: () => void;
}

// One task list for one view. `workspaceId` null = nothing to load yet.
// Lists patch themselves from TaskContext events, refetch quietly when the tab regains
// focus, and throw away answers for a workspace the user already switched away from.
export function useWorkspaceTasks(workspaceId: string | null | undefined, query: TaskServerQuery = {}): WorkspaceTasks {
  const { subscribe } = useTaskActions();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [failure, setFailure] = useState<Failure | null>(null);

  // A stable key so callers can pass an inline object literal without refetch loops.
  const queryKey = JSON.stringify(query);

  // NOTE: every request gets a number; only the newest may write. A slow answer for
  // workspace A arriving after a switch to B would otherwise paint A's tasks under B's
  // name (SRS SR02 "clear previous workspace query state").
  const latestRequestRef = useRef(0);
  const tasksRef = useRef<Task[]>([]);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const load = useCallback(
    async ({ quiet }: { quiet: boolean }) => {
      if (!workspaceId) return;
      const requestNumber = ++latestRequestRef.current;
      if (!quiet) setStatus("loading");
      try {
        const response = await getAllTasks(workspaceId, JSON.parse(queryKey));
        if (requestNumber !== latestRequestRef.current) return;
        setTasks(response.data.data.tasks);
        setFailure(null);
        setStatus("ready");
      } catch (error) {
        if (requestNumber !== latestRequestRef.current) return;
        // A quiet refresh that fails keeps showing the data we have.
        if (!quiet) {
          setFailure(describeFailure(error, "Couldn't load tasks."));
          setStatus("error");
        }
      }
    },
    [workspaceId, queryKey]
  );

  // New workspace or new filters: start clean so stale rows never flash.
  useEffect(() => {
    setTasks([]);
    load({ quiet: false });
  }, [load]);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === "remove") {
          setTasks((current) => current.filter((task) => task.id !== event.taskId));
          return;
        }
        if (event.type === "upsert") {
          const current = tasksRef.current;
          const isListed = current.some((task) => task.id === event.task.id);
          const parentIsListed = !!event.task.parentTaskId && current.some((task) => task.id === event.task.parentTaskId);
          if (isListed) {
            setTasks((rows) => rows.map((task) => (task.id === event.task.id ? event.task : task)));
          }
          // A subtask changed under a listed parent (counts moved), or a task may now
          // match this list (e.g. just assigned to me) — only the server can say.
          if (parentIsListed || !isListed) load({ quiet: true });
          return;
        }
        // A new task shows up straight away where it obviously belongs (whole-workspace
        // or same-project lists of top-level tasks); the refetch below then reconciles
        // order and anything only the server can decide (e.g. "assigned to me").
        if (event.type === "created" && event.task.workspaceId === workspaceId && !event.task.parentTaskId) {
          const parsedQuery: TaskServerQuery = JSON.parse(queryKey);
          const belongsHere = !parsedQuery.assignee && (!parsedQuery.projectId || parsedQuery.projectId === event.task.projectId);
          if (belongsHere) setTasks((rows) => (rows.some((task) => task.id === event.task.id) ? rows : [event.task, ...rows]));
        }
        load({ quiet: true });
      }),
    [subscribe, load, workspaceId, queryKey]
  );

  // Someone else may have changed things while this tab sat in the background.
  useEffect(() => {
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") load({ quiet: true });
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => document.removeEventListener("visibilitychange", refreshOnReturn);
  }, [load]);

  const reload = useCallback(() => {
    load({ quiet: false });
  }, [load]);

  return { tasks, status, failure, reload };
}
