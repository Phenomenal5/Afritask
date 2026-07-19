"use client";

// TaskCard presents one task with status, priority, deadline, and quick actions.
import { useEffect, useState } from "react";

const PRIORITY_STYLES = {
  high: { color: "var(--clay)", bg: "var(--clay-tint)", label: "High" },
  medium: { color: "var(--gold)", bg: "var(--gold-tint)", label: "Medium" },
  low: { color: "var(--stone)", bg: "var(--stone-tint)", label: "Low" },
};

const STATUS_LABELS = {
  pending: "Pending",
  "in progress": "In progress",
  completed: "Completed",
};

// Format a deadline and label relative dates so overdue work is obvious at a glance.
function formatDeadline(dateStr, todayStr) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);

  if (!todayStr) return { text: formatted, overdue: false };

  const today = new Date(todayStr);
  const diffDays = Math.ceil((date - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { text: `${formatted} (overdue)`, overdue: true };
  if (diffDays === 0) return { text: "Today", overdue: false };
  if (diffDays === 1) return { text: "Tomorrow", overdue: false };
  return { text: formatted, overdue: false };
}

// Render a task row with optimistic state cues and edit/delete controls.
export default function TaskCard({ task, onToggleComplete, onEdit, onDelete }) {
  const [deleting, setDeleting] = useState(false);
  const [todayStr, setTodayStr] = useState("");
  const priority = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.low;
  const deadline = formatDeadline(task.deadline, todayStr);
  const isCompleted = task.status === "completed";

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setTodayStr(today.toISOString());
  }, []);

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(task._id);
    // no need to reset deleting — card will unmount on success
  };

  return (
    <div
      className="group flex gap-3.5 p-4 rounded-xl transition-all relative overflow-hidden"
      style={{
        background: "var(--paper-raised)",
        border: "1px solid var(--line)",
        opacity: deleting ? 0.5 : 1,
      }}
    >
      {/* Signature priority tab on the left edge */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: priority.color }}
      />

      <input
        type="checkbox"
        className="task-check mt-0.5 ml-1"
        checked={isCompleted}
        onChange={() =>
          onToggleComplete(task._id, isCompleted ? "pending" : "completed")
        }
        aria-label={`Mark "${task.title}" as ${isCompleted ? "pending" : "completed"}`}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="text-[15px] font-medium leading-snug"
            style={{
              color: isCompleted ? "var(--ink-soft)" : "var(--ink)",
              textDecoration: isCompleted ? "line-through" : "none",
            }}
          >
            {task.title}
          </h3>

          <div className="flex items-center gap-1 opacity-100 transition-opacity flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100">
            <button
              onClick={() => onEdit(task)}
              className="p-1.5 rounded-md hover:bg-[var(--line-soft)] cursor-pointer"
              aria-label="Edit task"
              style={{ color: "var(--ink-soft)" }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M11.5 2.5l2 2-7.5 7.5H4v-2l7.5-7.5z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-md hover:bg-[var(--error-tint)] cursor-pointer"
              aria-label="Delete task"
              style={{ color: "var(--ink-soft)" }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M3 4.5h10M6.5 4.5V3a1 1 0 011-1h1a1 1 0 011 1v1.5M4.5 4.5l.5 8a1 1 0 001 1h4a1 1 0 001-1l.5-8"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {task.description && (
          <p
            className="text-sm mt-1 line-clamp-2"
            style={{ color: "var(--ink-soft)" }}
          >
            {task.description}
          </p>
        )}

        <div className="flex items-center flex-wrap gap-2 mt-3">
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ background: priority.bg, color: priority.color }}
          >
            {priority.label}
          </span>

          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: "var(--line-soft)", color: "var(--ink-soft)" }}
          >
            {STATUS_LABELS[task.status] || task.status}
          </span>

          {deadline && (
            <span
              className="text-xs flex items-center gap-1"
              style={{ color: deadline.overdue ? "var(--error)" : "var(--ink-soft)" }}
            >
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <rect x="1.5" y="2.5" width="9" height="8" rx="1.5" stroke="currentColor" strokeWidth="1" />
                <path d="M1.5 4.5h9M4 1.5v2M8 1.5v2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
              </svg>
              {deadline.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
