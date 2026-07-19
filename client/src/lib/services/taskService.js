/**
 * Task service wrappers for the backend task routes.
 * These functions keep task CRUD and status updates outside the UI layer.
 */
import api from "@/lib/api";

// Load all tasks, optionally filtered by query parameters.
export const getAllTasks = (params) => {
  // GET /task returns the current task list in the backend response envelope.
  return api.get("/task", { params });
};

// Load one task record by id.
export const getOneTask = (id) => {
  // GET /task/:id returns a single task object for details or editing flows.
  return api.get(`/task/${id}`);
};

// Create a new task record.
export const createTask = (data) => {
  // POST /task expects the task payload and returns the created task.
  return api.post("/task", data);
};

// Update a task record with edited fields.
export const updateTask = (id, data) => {
  // PUT /task/:id expects the updated task payload and returns the saved task.
  return api.put(`/task/${id}`, data);
};

// Update only the status field of a task.
export const updateTaskStatus = (id, status) => {
  // PATCH /task/:id/status expects the new status and returns the updated task.
  return api.patch(`/task/${id}/status`, { status });
};

// Delete a task record by id.
export const deleteTask = (id) => {
  // DELETE /task/:id removes the task and returns the backend delete response.
  return api.delete(`/task/${id}`);
};
