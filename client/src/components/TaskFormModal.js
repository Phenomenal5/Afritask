"use client";

// Modal form used for both creating new tasks and editing existing ones.
import { useState, useEffect } from "react";
import { useTasks } from "@/context/TaskContext";
import FormField from "./FormField";
import Button from "./Button";

const EMPTY = {
  title: "",
  description: "",
  status: "pending",
  priority: "medium",
  deadline: "",
};

export default function TaskFormModal({ open, onClose, task }) {
  const { createTask, updateTask } = useTasks();
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const isEditing = !!task;

  // Sync the modal form with the selected task whenever the modal opens or the task changes.
  useEffect(() => {
    if (task) {
      setForm({
        title: task.title || "",
        description: task.description || "",
        status: task.status || "pending",
        priority: task.priority || "medium",
        deadline: task.deadline ? task.deadline.slice(0, 10) : "",
      });
    } else {
      setForm(EMPTY);
    }
  }, [task, open]);

  // Close on Escape for keyboard users
  useEffect(() => {
    function handleKey(e) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const payload = { ...form };
    if (!payload.deadline) delete payload.deadline;

    const res = isEditing
      ? await updateTask(task._id, payload)
      : await createTask(payload);

    setLoading(false);
    if (res.success) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4"
      style={{ background: "color-mix(in srgb, var(--ink) 40%, transparent)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--paper-raised)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-2xl" style={{ color: "var(--ink)" }}>
            {isEditing ? "Edit task" : "New Afritask task"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-[var(--line-soft)] cursor-pointer"
            aria-label="Close"
            style={{ color: "var(--ink-soft)" }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField
            label="Title"
            name="title"
            value={form.title}
            onChange={handleChange}
            placeholder="What needs to get done?"
            required
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Description
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Add any helpful detail (optional)"
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none resize-none"
              style={{
                background: "var(--paper-raised)",
                border: "1px solid var(--line)",
                color: "var(--ink)",
              }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                Priority
              </label>
              <select
                name="priority"
                value={form.priority}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none"
                style={{ background: "var(--paper-raised)", border: "1px solid var(--line)", color: "var(--ink)" }}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                Status
              </label>
              <select
                name="status"
                value={form.status}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none"
                style={{ background: "var(--paper-raised)", border: "1px solid var(--line)", color: "var(--ink)" }}
              >
                <option value="pending">Pending</option>
                <option value="in progress">In progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <FormField
            label="Deadline (optional)"
            name="deadline"
            type="date"
            value={form.deadline}
            onChange={handleChange}
          />

          <div className="flex gap-2 mt-2">
            <Button type="button" variant="secondary" full onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" full loading={loading}>
              {isEditing ? "Save changes" : "Add task"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
