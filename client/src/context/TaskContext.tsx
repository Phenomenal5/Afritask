/**
 * Task writes live here; task LISTS live in the views that show them (useWorkspaceTasks).
 *
 * Every write announces its result on a small event stream, so every list on screen —
 * the overview, My Tasks, a project board, an open task drawer — patches itself from the
 * same saved copy. That is what keeps List and Board consistent: neither owns the data.
 */
"use client";

import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from "react";
import toast from "react-hot-toast";
import {
  createSubtask as createSubtaskRequest,
  createTask as createTaskRequest,
  deleteTask as deleteTaskRequest,
  updateTask as updateTaskRequest,
  updateTaskStatus as updateTaskStatusRequest,
} from "@/lib/services/taskService";
import { describeFailure } from "@/lib/errors";
import { STATUS_LABELS } from "@/utils/taskMeta";
import type { ActionResult, Task, TaskStatus } from "@/types/models";

// ─── Events ─────────────────────
// upsert: this task's latest copy (optimistic or saved). created: a new task exists —
// lists refetch because only the server knows whether it matches their filters.
// remove: gone. stale: a write hit a version conflict — refetch everything.
export type TaskEvent =
  | { type: "upsert"; task: Task }
  | { type: "created"; task: Task }
  | { type: "remove"; taskId: string }
  | { type: "stale" };

type TaskListener = (event: TaskEvent) => void;

// Fields the create/edit forms send. Due fields follow the server's parseDue contract:
// dueDate (+dueTimezone) for date-only, dueAt for an exact instant, dueDate:null clears.
export interface TaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: Task["priority"];
  projectId?: string | null;
  assigneeMembershipId?: string | null;
  labelIds?: string[];
  dueDate?: string | null;
  dueTimezone?: string;
  dueAt?: string;
  // "none" clears it. Omitted on create with a due date → the server's default (1 day before).
  reminderOffset?: string;
  startDate?: string | null;
  startAt?: string;
  startTimezone?: string;
  // With status "completed" (or to correct it on a completed task): what was done.
  completionNote?: string;
  clientRequestId?: string;
}

interface TaskActions {
  createTask: (workspaceId: string, input: TaskInput) => Promise<ActionResult<Task>>;
  createSubtask: (parent: Task, input: TaskInput) => Promise<ActionResult<Task>>;
  updateTask: (task: Task, changes: TaskInput) => Promise<ActionResult<Task>>;
  updateTaskStatus: (task: Task, status: TaskStatus, completionNote?: string) => Promise<ActionResult<Task>>;
  deleteTask: (task: Task) => Promise<ActionResult>;
  subscribe: (listener: TaskListener) => () => void;
}

const TaskContext = createContext<TaskActions | null>(null);

export function TaskProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef(new Set<TaskListener>());

  const emit = useCallback((event: TaskEvent) => {
    listenersRef.current.forEach((listener) => listener(event));
  }, []);

  const subscribe = useCallback((listener: TaskListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  // One place that turns a failed write into feedback. Returns the ActionResult to hand back.
  // NOTE: a 409 means someone else saved first. We never retry blindly — every list
  // refetches so the user sees the newer values and redoes their change on top (SRS SR06).
  const handleFailure = useCallback(
    (error: unknown, fallback: string): ActionResult<never> => {
      const failure = describeFailure(error, fallback);
      if (failure.kind === "session") return { success: false, message: failure.message };
      if (failure.kind === "conflict") {
        toast.error("Someone else changed this task first. Showing the latest version — please redo your change.");
        emit({ type: "stale" });
        return { success: false, conflict: true, message: failure.message };
      }
      toast.error(failure.message);
      return { success: false, forbidden: failure.kind === "forbidden", message: failure.message };
    },
    [emit]
  );

  const createTask = useCallback(
    async (workspaceId: string, input: TaskInput): Promise<ActionResult<Task>> => {
      try {
        const res = await createTaskRequest(workspaceId, input);
        const task: Task = res.data.data.task;
        emit({ type: "created", task });
        toast.success(`Added “${task.title}”`);
        return { success: true, data: task };
      } catch (error) {
        return handleFailure(error, "Couldn't add the task. Your text is still in the form — try again.");
      }
    },
    [emit, handleFailure]
  );

  const createSubtask = useCallback(
    async (parent: Task, input: TaskInput): Promise<ActionResult<Task>> => {
      try {
        const res = await createSubtaskRequest(parent.id, input);
        const subtask: Task = res.data.data.task;
        emit({ type: "created", task: subtask });
        return { success: true, data: subtask };
      } catch (error) {
        return handleFailure(error, "Couldn't add the subtask. Try again.");
      }
    },
    [emit, handleFailure]
  );

  const updateTask = useCallback(
    async (task: Task, changes: TaskInput): Promise<ActionResult<Task>> => {
      try {
        const res = await updateTaskRequest(task.id, { ...changes, version: task.version });
        const saved: Task = res.data.data.task;
        emit({ type: "upsert", task: saved });
        toast.success("Changes saved");
        return { success: true, data: saved };
      } catch (error) {
        return handleFailure(error, "Couldn't save your changes. They're still here — try again.");
      }
    },
    [emit, handleFailure]
  );

  // Optimistic: the status moves immediately and moves back if the server refuses
  // (PRD FR12: "failed updates restore the prior state and show an error").
  const updateTaskStatus = useCallback(
    async (task: Task, status: TaskStatus, completionNote?: string): Promise<ActionResult<Task>> => {
      if (task.status === status) return { success: true, data: task };
      emit({ type: "upsert", task: { ...task, status } });
      try {
        const res = await updateTaskStatusRequest(task.id, status, task.version, completionNote);
        const saved: Task = res.data.data.task;
        emit({ type: "upsert", task: saved });
        toast.success(`“${saved.title}” moved to ${STATUS_LABELS[status]}`, { id: `status-${task.id}` });
        return { success: true, data: saved };
      } catch (error) {
        emit({ type: "upsert", task });
        return handleFailure(error, "Couldn't change the status. It's back where it was.");
      }
    },
    [emit, handleFailure]
  );

  const deleteTask = useCallback(
    async (task: Task): Promise<ActionResult> => {
      try {
        await deleteTaskRequest(task.id);
        emit({ type: "remove", taskId: task.id });
        // A deleted subtask changes its parent's counts; a deleted parent takes its subtasks.
        emit({ type: "stale" });
        toast.success(`Deleted “${task.title}”`);
        return { success: true };
      } catch (error) {
        return handleFailure(error, "Couldn't delete the task. It's still there.");
      }
    },
    [emit, handleFailure]
  );

  const value = useMemo(
    () => ({ createTask, createSubtask, updateTask, updateTaskStatus, deleteTask, subscribe }),
    [createTask, createSubtask, updateTask, updateTaskStatus, deleteTask, subscribe]
  );

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

export function useTaskActions(): TaskActions {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error("useTaskActions must be used within a TaskProvider");
  return ctx;
}
