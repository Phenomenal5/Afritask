"use client";

// Modal form used for both creating new tasks and editing existing ones.
// Only the title is required; everything else is optional detail (PRD principle:
// keep task creation quick, expose details progressively).
import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTasks } from "@/context/TaskContext";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { getWorkspaceProjects } from "@/lib/services/projectService";
import { getWorkspace } from "@/lib/services/workspaceService";
import { PRIORITY_STYLES, STATUS_LABELS, TASK_PRIORITIES, TASK_STATUSES, isoDateInZone, localTimeOf } from "@/utils/taskMeta";
import FormField from "./FormField";
import Button from "./Button";

const EMPTY = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  dueDate: "",
  dueTime: "",
  projectId: "",
  assigneeMembershipId: "",
};

const selectStyle = { background: "var(--paper-raised)", border: "1px solid var(--line)", color: "var(--ink)" };

// One fresh key per opened "new task" form: a double-clicked Save sends the same key twice
// and the server creates the task once (SRS SR06 idempotency).
const newRequestId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

// The form's due fields for an existing task, shown the way it was set (PRD §9).
const dueFieldsOf = (task) => {
  if (!task.dueAt) return { dueDate: "", dueTime: "" };
  if (task.dueKind === "date") return { dueDate: isoDateInZone(task.dueAt, task.dueTimezone || "UTC"), dueTime: "" };
  return { dueDate: isoDateInZone(task.dueAt, Intl.DateTimeFormat().resolvedOptions().timeZone), dueTime: localTimeOf(task.dueAt) };
};

// defaultProjectId pre-selects a project (e.g. "Add task" from a project page).
export default function TaskFormModal({ open, onClose, task, defaultProjectId = "" }) {
  const { user } = useAuth();
  const { createTask, updateTask } = useTasks();
  const { activeWorkspace } = useWorkspaces();
  const [form, setForm] = useState(EMPTY);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [requestId, setRequestId] = useState(newRequestId);
  const [loading, setLoading] = useState(false);
  const isEditing = !!task;

  // Project and assignee choices for the active workspace. Archived projects are
  // read-only, so they aren't offered (the server would refuse them anyway).
  useEffect(() => {
    if (!open || !activeWorkspace?.id) return;
    getWorkspaceProjects(activeWorkspace.id)
      .then((res) => setProjects(res.data.data.projects))
      .catch(() => setProjects([]));
    getWorkspace(activeWorkspace.id)
      .then((res) => setMembers(res.data.data.workspace.members))
      .catch(() => setMembers([]));
  }, [open, activeWorkspace?.id]);

  // Sync the modal form with the selected task whenever the modal opens or the task changes.
  useEffect(() => {
    if (task) {
      setForm({
        title: task.title || "",
        description: task.description || "",
        status: task.status || "todo",
        priority: task.priority || "medium",
        ...dueFieldsOf(task),
        projectId: task.projectId || "",
        assigneeMembershipId: task.assigneeMembershipId || "",
      });
    } else {
      setForm({ ...EMPTY, projectId: defaultProjectId });
      setRequestId(newRequestId());
    }
  }, [task, open, defaultProjectId]);

  // PRD J1 default: in a workspace with only one member, preselect them as assignee
  // (they can clear it). Only for new tasks, and only once members have loaded.
  useEffect(() => {
    if (!open || isEditing || members.length !== 1) return;
    setForm((prev) => (prev.assigneeMembershipId ? prev : { ...prev, assigneeMembershipId: members[0].id }));
  }, [open, isEditing, members]);

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
    const { dueDate, dueTime, ...fields } = form;
    const payload = {
      ...fields,
      projectId: form.projectId || null,
      assigneeMembershipId: form.assigneeMembershipId || null,
    };

    // NOTE: untouched due fields are NOT re-sent when editing. Re-sending a date-only due
    // date would re-resolve it in my CURRENT profile timezone and could move a deadline
    // that was set in another zone (PRD §9: the saved instant must not drift).
    const originalDue = isEditing ? dueFieldsOf(task) : null;
    const dueUnchanged = isEditing && originalDue.dueDate === dueDate && originalDue.dueTime === dueTime;

    // A date alone = "due that day" (23:59 in my profile timezone, resolved by the server);
    // a date + time = that exact moment on this device's clock.
    if (dueUnchanged) {
      // leave the deadline exactly as stored
    } else if (dueDate && dueTime) {
      payload.dueAt = new Date(`${dueDate}T${dueTime}`).toISOString();
    } else if (dueDate) {
      payload.dueDate = dueDate;
      payload.dueTimezone = user?.timezone || "UTC";
    } else if (isEditing && task.dueAt) {
      payload.dueDate = null; // cleared
    }

    const res = isEditing
      ? await updateTask(task.id, { ...payload, version: task.version })
      : await createTask({ ...payload, clientRequestId: requestId });

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-form-title"
        className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--paper-raised)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 id="task-form-title" className="font-display text-2xl" style={{ color: "var(--ink)" }}>
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
            <label htmlFor="description" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Add any helpful detail (optional)"
              rows={3}
              maxLength={20000}
              className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none resize-none"
              style={selectStyle}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="priority" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                Priority
              </label>
              <select id="priority" name="priority" value={form.priority} onChange={handleChange} className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none" style={selectStyle}>
                {TASK_PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {PRIORITY_STYLES[priority].label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="status" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                Status
              </label>
              <select id="status" name="status" value={form.status} onChange={handleChange} className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none" style={selectStyle}>
                {TASK_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {members.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="assigneeMembershipId" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                Assignee
              </label>
              <select
                id="assigneeMembershipId"
                name="assigneeMembershipId"
                value={form.assigneeMembershipId}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none"
                style={selectStyle}
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.user.name}
                    {member.user.id === user?.id ? " (me)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {projects.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="projectId" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                Project
              </label>
              <select id="projectId" name="projectId" value={form.projectId} onChange={handleChange} className="w-full px-3.5 py-2.5 rounded-lg text-sm outline-none" style={selectStyle}>
                <option value="">No project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Due date (optional)" name="dueDate" type="date" value={form.dueDate} onChange={handleChange} />
            <FormField label="Time (optional)" name="dueTime" type="time" value={form.dueTime} onChange={handleChange} />
          </div>
          {form.dueDate && !form.dueTime && (
            <p className="text-xs -mt-2" style={{ color: "var(--ink-soft)" }}>
              Due by the end of that day ({(user?.timezone || "UTC").replaceAll("_", " ")}).
            </p>
          )}

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
