/**
 * Task list state and task actions live here.
 * This keeps the dashboard data flow separate from auth and profile concerns.
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import {
  createTask as createTaskRequest,
  deleteTask as deleteTaskRequest,
  getAllTasks,
  updateTask as updateTaskRequest,
  updateTaskStatus as updateTaskStatusRequest,
} from "@/lib/services/taskService";

const TaskContext = createContext(null);

// Provide the ACTIVE workspace's task list and CRUD actions to the dashboard and task form.
export function TaskProvider({ children, logoutVersion = 0, activeWorkspaceId = null }) {
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  // NOTE: the workspace the list currently belongs to. A slow response for the workspace
  // the user just switched away from must be discarded, or it would paint workspace A's
  // tasks under workspace B's name (SRS SR02 "clear previous workspace query state").
  const currentWorkspaceRef = useRef(activeWorkspaceId);
  // Latest list for optimistic updates (to read a task's version and restore on failure).
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // Clear the local task cache after sign-out or a workspace switch.
  useEffect(() => {
    currentWorkspaceRef.current = activeWorkspaceId;
    setTasks([]);
  }, [logoutVersion, activeWorkspaceId]);

  const fetchTasks = useCallback(async (params) => {
    const requestedWorkspaceId = activeWorkspaceId;
    if (!requestedWorkspaceId) return { success: false };
    setTasksLoading(true);
    try {
      const res = await getAllTasks(requestedWorkspaceId, params);
      if (currentWorkspaceRef.current === requestedWorkspaceId) setTasks(res.data.data.tasks);
      return { success: true };
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not load tasks");
      return { success: false };
    } finally {
      setTasksLoading(false);
    }
  }, [activeWorkspaceId]);

  const createTask = useCallback(async (data) => {
    if (!activeWorkspaceId) return { success: false, message: "Choose a workspace first" };
    try {
      const res = await createTaskRequest(activeWorkspaceId, data);
      const newTask = res.data.data.task;
      // A repeated submit (same clientRequestId) returns the existing task — don't list it twice.
      setTasks((prev) => [newTask, ...prev.filter((t) => t.id !== newTask.id)]);
      toast.success("Task added");
      return { success: true, task: newTask };
    } catch (err) {
      const message = err.response?.data?.message || "Could not create task";
      toast.error(message);
      return { success: false, message };
    }
  }, [activeWorkspaceId]);

  // NOTE: the server rejects writes based on an old `version` with 409 (someone else
  // changed the task first). We never retry blindly — reload so the user sees the newer
  // values, and let them redo their change on top (SRS SR06).
  const handleConflict = useCallback(
    (err) => {
      if (err.response?.status !== 409 || !/changed by someone else/.test(err.response?.data?.message || "")) return false;
      toast.error("Someone else changed this task. Showing the latest version.");
      fetchTasks();
      return true;
    },
    [fetchTasks]
  );

  const updateTask = useCallback(async (id, data) => {
    try {
      const res = await updateTaskRequest(id, data);
      const updated = res.data.data.task;
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? updated : t))
      );
      toast.success("Task updated");
      return { success: true };
    } catch (err) {
      if (handleConflict(err)) return { success: false, conflict: true };
      const message = err.response?.data?.message || "Could not update task";
      toast.error(message);
      return { success: false, message };
    }
  }, [handleConflict]);

  const updateTaskStatus = useCallback(async (id, status) => {
    // Flip the UI immediately, but remember the old array so we can restore it if the request fails.
    const previous = tasksRef.current;
    const currentTask = previous.find((t) => t.id === id);
    if (!currentTask) return { success: false };
    setTasks(previous.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      const res = await updateTaskStatusRequest(id, status, currentTask.version);
      // Take the server's copy: it carries the new version and completedAt.
      setTasks((prev) => prev.map((t) => (t.id === id ? res.data.data.task : t)));
      return { success: true };
    } catch (err) {
      setTasks(previous);
      if (handleConflict(err)) return { success: false, conflict: true };
      toast.error(err.response?.data?.message || "Could not update status");
      return { success: false };
    }
  }, [handleConflict]);

  const deleteTask = useCallback(async (id) => {
    // Remove the task optimistically so the list feels instant, then restore it if deletion fails.
    const previous = tasksRef.current;
    setTasks(previous.filter((t) => t.id !== id));
    try {
      await deleteTaskRequest(id);
      toast.success("Task deleted");
      return { success: true };
    } catch (err) {
      setTasks(previous);
      toast.error(err.response?.data?.message || "Could not delete task");
      return { success: false };
    }
  }, []);

  const value = useMemo(
    () => ({
      tasks,
      tasksLoading,
      fetchTasks,
      createTask,
      updateTask,
      updateTaskStatus,
      deleteTask,
    }),
    [tasks, tasksLoading, fetchTasks, createTask, updateTask, updateTaskStatus, deleteTask]
  );

  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
}

// Read the dashboard task state and task actions from the task provider.
export function useTasks() {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error("useTasks must be used within a TaskProvider");
  return ctx;
}
