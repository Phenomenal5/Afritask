"use client";

// TaskSubtasks: the subtask list inside a task's edit view (PRD FR07, one level only).
// Each subtask has its own status and assignee; completing the parent never completes them.
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { createSubtask, getOneTask, updateTaskStatus } from "@/lib/services/taskService";
import Button from "./Button";

export default function TaskSubtasks({ parentTask, members, onChanged }) {
  const [subtasks, setSubtasks] = useState([]);
  const [newTitle, setNewTitle] = useState("");
  const [newAssigneeId, setNewAssigneeId] = useState("");
  const [adding, setAdding] = useState(false);

  const loadSubtasks = useCallback(async () => {
    const res = await getOneTask(parentTask.id);
    setSubtasks(res.data.data.task.subtasks || []);
  }, [parentTask.id]);

  useEffect(() => {
    loadSubtasks().catch(() => setSubtasks([]));
  }, [loadSubtasks]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(true);
    try {
      await createSubtask(parentTask.id, { title: newTitle, assigneeMembershipId: newAssigneeId || null });
      setNewTitle("");
      await loadSubtasks();
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not add the subtask");
    } finally {
      setAdding(false);
    }
  };

  const toggle = async (subtask) => {
    const nextStatus = subtask.status === "completed" ? "todo" : "completed";
    try {
      await updateTaskStatus(subtask.id, nextStatus, subtask.version);
      await loadSubtasks();
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || "Could not update the subtask");
      loadSubtasks();
    }
  };

  const completedCount = subtasks.filter((subtask) => subtask.status === "completed").length;

  return (
    <div className="flex flex-col gap-2 pt-2" style={{ borderTop: "1px solid var(--line-soft)" }}>
      <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
        Subtasks {subtasks.length > 0 && <span style={{ color: "var(--ink-soft)" }}>({completedCount}/{subtasks.length})</span>}
      </p>

      {subtasks.map((subtask) => (
        <label key={subtask.id} className="flex items-center gap-2.5 text-sm cursor-pointer">
          <input type="checkbox" className="task-check" checked={subtask.status === "completed"} onChange={() => toggle(subtask)} />
          <span
            className="flex-1"
            style={{ color: subtask.status === "completed" ? "var(--ink-soft)" : "var(--ink)", textDecoration: subtask.status === "completed" ? "line-through" : "none" }}
          >
            {subtask.title}
          </span>
          {subtask.assignee && (
            <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
              {subtask.assignee.user.name}
            </span>
          )}
        </label>
      ))}

      <div className="flex gap-2">
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd(e);
          }}
          placeholder="Add a subtask…"
          aria-label="New subtask title"
          className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
          style={{ background: "var(--paper-raised)", border: "1px solid var(--line)", color: "var(--ink)" }}
        />
        {members.length > 1 && (
          <select
            aria-label="New subtask assignee"
            value={newAssigneeId}
            onChange={(e) => setNewAssigneeId(e.target.value)}
            className="text-xs px-2 rounded-lg outline-none"
            style={{ background: "var(--paper-raised)", border: "1px solid var(--line)", color: "var(--ink)" }}
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.user.name}
              </option>
            ))}
          </select>
        )}
        <Button size="sm" variant="secondary" loading={adding} onClick={handleAdd}>
          Add
        </Button>
      </div>
    </div>
  );
}
