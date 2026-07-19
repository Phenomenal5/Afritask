/**
 * Task list state and task actions live here.
 * This keeps the dashboard data flow separate from auth and profile concerns.
 */
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  createTask as createTaskRequest,
  deleteTask as deleteTaskRequest,
  getAllTasks,
  updateTask as updateTaskRequest,
  updateTaskStatus as updateTaskStatusRequest,
} from "@/lib/services/taskService";

const TaskContext = createContext(null);

// Provide task list state and CRUD actions to the dashboard and task form.
export function TaskProvider({ children, logoutVersion = 0 }) {
  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);

  // Clear the local task cache after sign-out so the next session starts clean.
  useEffect(() => {
    setTasks([]);
  }, [logoutVersion]);

  const fetchTasks = useCallback(async (params) => {
    setTasksLoading(true);
    try {
      const res = await getAllTasks(params);
      setTasks(res.data.data.tasks);
      return { success: true };
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not load tasks");
      return { success: false };
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const createTask = useCallback(async (data) => {
    try {
      const res = await createTaskRequest(data);
      const newTask = res.data.data.task;
      setTasks((prev) => [newTask, ...prev]);
      toast.success("Task added");
      return { success: true, task: newTask };
    } catch (err) {
      const message = err.response?.data?.message || "Could not create task";
      toast.error(message);
      return { success: false, message };
    }
  }, []);

  const updateTask = useCallback(async (id, data) => {
    try {
      const res = await updateTaskRequest(id, data);
      const updated = res.data.data.task;
      setTasks((prev) =>
        prev.map((t) => (t._id === id ? { ...t, ...updated } : t))
      );
      toast.success("Task updated");
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || "Could not update task";
      toast.error(message);
      return { success: false, message };
    }
  }, []);

  const updateTaskStatus = useCallback(async (id, status) => {
    // Flip the UI immediately, but remember the old array so we can restore it if the request fails.
    let previous;
    setTasks((prev) => {
      previous = prev;
      return prev.map((t) => (t._id === id ? { ...t, status } : t));
    });
    try {
      await updateTaskStatusRequest(id, status);
      return { success: true };
    } catch (err) {
      setTasks(previous);
      toast.error(err.response?.data?.message || "Could not update status");
      return { success: false };
    }
  }, []);

  const deleteTask = useCallback(async (id) => {
    // Remove the task optimistically so the list feels instant, then restore it if deletion fails.
    let previous;
    setTasks((prev) => {
      previous = prev;
      return prev.filter((t) => t._id !== id);
    });
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
