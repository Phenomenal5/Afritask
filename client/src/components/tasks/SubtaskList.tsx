"use client";

// Subtasks of one task (PRD FR07: one level only). Each subtask has its own assignee and
// status, and its own permissions — editing the parent doesn't grant editing a subtask
// assigned to someone else. Any member can add one while the parent isn't archived.
import { useRef, useState, type FormEvent } from "react";
import { ChevronRight, ListTree, Plus } from "lucide-react";
import { useTaskActions } from "@/context/TaskContext";
import { useWorkspaceResources } from "@/context/WorkspaceResourcesContext";
import { useViewer } from "@/hooks/useViewer";
import { useNow } from "@/hooks/useNow";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { canEditTask, editBlockedReason } from "@/utils/permissions";
import { cx } from "@/lib/cx";
import Button from "@/components/ui/Button";
import { DueLabel } from "@/components/ui/Badges";
import type { Task } from "@/types/models";

interface SubtaskListProps {
  parent: Task;
  onOpenSubtask: (taskId: string) => void;
}

export default function SubtaskList({ parent, onOpenSubtask }: SubtaskListProps) {
  const { createSubtask, updateTaskStatus } = useTaskActions();
  const { members } = useWorkspaceResources();
  const viewer = useViewer();
  const now = useNow();
  const online = useOnlineStatus();
  const [newTitle, setNewTitle] = useState("");
  const [newAssigneeId, setNewAssigneeId] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const subtasks = parent.subtasks ?? [];
  const completedCount = subtasks.filter((subtask) => subtask.status === "completed").length;
  const parentArchived = parent.project?.state === "archived";
  const progressPercent = subtasks.length ? Math.round((completedCount / subtasks.length) * 100) : 0;

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    if (!newTitle.trim()) {
      setTitleError("Name the subtask first.");
      titleInputRef.current?.focus();
      return;
    }
    setAdding(true);
    const result = await createSubtask(parent, { title: newTitle.trim(), assigneeMembershipId: newAssigneeId || null });
    setAdding(false);
    if (result.success) {
      setNewTitle("");
      setNewAssigneeId("");
      titleInputRef.current?.focus();
    }
  };

  const toggleSubtask = async (subtask: Task) => {
    setPendingIds((ids) => [...ids, subtask.id]);
    await updateTaskStatus(subtask, subtask.status === "completed" ? "todo" : "completed");
    setPendingIds((ids) => ids.filter((id) => id !== subtask.id));
  };

  return (
    <section aria-labelledby="subtasks-heading">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="subtasks-heading" className="flex items-center gap-2 text-[16px] font-semibold text-ink">
          <ListTree size={18} aria-hidden="true" />
          Subtasks
        </h3>
        {subtasks.length > 0 && (
          <span className="text-[14px] text-muted">
            {completedCount} of {subtasks.length} completed
          </span>
        )}
      </div>

      {subtasks.length > 0 && (
        <>
          <div
            role="progressbar"
            aria-label="Subtasks completed"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-muted"
          >
            <div className="h-full rounded-full bg-done transition-[width] duration-300" style={{ width: `${progressPercent}%` }} />
          </div>
          <ul className="mb-3 overflow-hidden rounded-[12px] border border-line">
            {subtasks.map((subtask) => {
              const editable = canEditTask(viewer, subtask) && online;
              const isDone = subtask.status === "completed";
              const isPending = pendingIds.includes(subtask.id);
              return (
                <li key={subtask.id} className="flex items-center gap-3 border-t border-line-soft bg-surface px-3 py-2 first:border-t-0">
                  <input
                    type="checkbox"
                    className="task-check"
                    checked={isDone}
                    disabled={!editable || isPending}
                    title={editable ? undefined : editBlockedReason(viewer, subtask) ?? "You're offline."}
                    onChange={() => toggleSubtask(subtask)}
                    aria-label={`Mark “${subtask.title}” as ${isDone ? "not completed" : "completed"}`}
                  />
                  <button
                    type="button"
                    onClick={() => onOpenSubtask(subtask.id)}
                    className="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col justify-center rounded text-left"
                  >
                    <span className={cx("truncate text-[15px]", isDone ? "text-muted line-through" : "text-ink")}>{subtask.title}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-[13px] text-muted">
                      <span>{subtask.assignee ? subtask.assignee.user.name : "Unassigned"}</span>
                      {subtask.dueAt && (
                        <>
                          <span aria-hidden="true">·</span>
                          <DueLabel task={subtask} now={now} />
                        </>
                      )}
                    </span>
                  </button>
                  <ChevronRight size={17} aria-hidden="true" className="shrink-0 text-muted" />
                </li>
              );
            })}
          </ul>
        </>
      )}

      {parentArchived ? (
        <p className="text-[14px] text-muted">This project is archived, so subtasks can&apos;t be added until it&apos;s restored.</p>
      ) : (
        <form onSubmit={handleAdd} noValidate className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <label htmlFor={`new-subtask-${parent.id}`} className="sr-only">
              New subtask title
            </label>
            <input
              ref={titleInputRef}
              id={`new-subtask-${parent.id}`}
              value={newTitle}
              onChange={(event) => {
                setNewTitle(event.target.value);
                setTitleError(null);
              }}
              placeholder={subtasks.length ? "Add another subtask" : "Break this into smaller steps"}
              aria-invalid={titleError ? true : undefined}
              aria-describedby={titleError ? `new-subtask-error-${parent.id}` : undefined}
              maxLength={200}
              className="field-control"
            />
            {titleError && (
              <p id={`new-subtask-error-${parent.id}`} className="mt-1 text-[13px] text-brick">
                {titleError}
              </p>
            )}
          </div>
          {members.length > 1 && (
            <>
              <label htmlFor={`new-subtask-assignee-${parent.id}`} className="sr-only">
                Subtask assignee
              </label>
              <select
                id={`new-subtask-assignee-${parent.id}`}
                value={newAssigneeId}
                onChange={(event) => setNewAssigneeId(event.target.value)}
                className="field-control sm:w-44"
              >
                <option value="">Unassigned</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.user.name}
                  </option>
                ))}
              </select>
            </>
          )}
          <Button type="submit" variant="secondary" loading={adding} disabled={!online} icon={<Plus size={16} aria-hidden="true" />}>
            Add
          </Button>
        </form>
      )}
    </section>
  );
}
