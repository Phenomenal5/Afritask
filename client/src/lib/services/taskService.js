/**
 * Task service wrappers for the backend task routes.
 * Lists and creates are scoped to a workspace; single-task routes use the task id
 * (the server checks the caller belongs to that task's workspace).
 */
import api from "@/lib/api";

// Load a workspace's tasks, optionally filtered by query parameters.
export const getAllTasks = (workspaceId, params) => {
  return api.get(`/workspaces/${workspaceId}/tasks`, { params });
};

// Load one task record by id.
export const getOneTask = (id) => {
  return api.get(`/tasks/${id}`);
};

// Create a task in a workspace.
export const createTask = (workspaceId, data) => {
  return api.post(`/workspaces/${workspaceId}/tasks`, data);
};

// Update a task record with edited fields.
export const updateTask = (id, data) => {
  return api.put(`/tasks/${id}`, data);
};

// Update only the status field of a task.
export const updateTaskStatus = (id, status) => {
  return api.patch(`/tasks/${id}/status`, { status });
};

// Delete a task record by id.
export const deleteTask = (id) => {
  return api.delete(`/tasks/${id}`);
};
