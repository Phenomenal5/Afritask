"use client";

// TaskCard presents one task with status, priority, deadline, and quick actions.
import { useEffect, useState } from "react";
import { PRIORITY_STYLES, STATUS_LABELS, describeDue } from "@/utils/taskMeta";

// Render a task row with optimistic state cues and edit/delete controls.
// showProject: off on a project's own page, where the badge would just repeat the header.
export default function TaskCard({ task, onToggleComplete, onEdit, onDelete, showProject = true }) {
  const [deleting, setDeleting] = useState(false);
  // "now" is read after mount so server and client render the same markup.
  const [now, setNow] = useState(null);
  const priority = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.low;
  const deadline = now ? describeDue(task, now) : null;
  const isCompleted = task.status === "completed";
  // Archived projects are read-only (the server refuses changes) — hide the controls.
  const isReadOnly = task.project?.state === "archived";

  useEffect(() => {
    setNow(new Date());
  }, []);

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete(task.id);
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
        disabled={isReadOnly}
        onChange={() =>
          onToggleComplete(task.id, isCompleted ? "todo" : "completed")
        }
        aria-label={`Mark "${task.title}" as ${isCompleted ? "to do" : "completed"}`}
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

          {!isReadOnly && (
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
          )}
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

          {task.assignee && (
            <span className="text-xs flex items-center gap-1" style={{ color: "var(--ink-soft)" }}>
              <span
                aria-hidden="true"
                className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[9px] font-semibold"
                style={{ background: "var(--moss-light)", color: "var(--ink)" }}
              >
                {task.assignee.user.name.charAt(0).toUpperCase()}
              </span>
              {task.assignee.user.name}
            </span>
          )}

          {showProject && task.project && (
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={{ border: "1px solid var(--line)", color: "var(--ink-soft)" }}
            >
              {task.project.name}
              {isReadOnly ? " · archived" : ""}
            </span>
          )}

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
