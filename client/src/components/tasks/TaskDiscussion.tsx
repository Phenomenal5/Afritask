"use client";

// TaskDiscussion: a task's comments on their own. Opened from the comment button on list
// rows and board cards, and from mention notifications, so people can comment or reply
// without scrolling past the task's settings. It shows just enough of the task to know
// what's being discussed; "Open full task" goes to the drawer for everything else.
import { useCallback, useEffect, useState } from "react";
import { ArrowUpLeft, FolderOpen, PanelRightOpen } from "lucide-react";
import { getOneTask } from "@/lib/services/taskService";
import { describeFailure, type Failure } from "@/lib/errors";
import { useNow } from "@/hooks/useNow";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import { DueLabel, StatusBadge } from "@/components/ui/Badges";
import { FailurePanel, Notice } from "@/components/ui/States";
import { AssigneeChip } from "./TaskMeta";
import TaskComments from "./TaskComments";
import type { Task } from "@/types/models";

interface TaskDiscussionProps {
  taskId: string;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
  onOpenComments: (taskId: string) => void;
}

export default function TaskDiscussion({ taskId, onClose, onOpenTask, onOpenComments }: TaskDiscussionProps) {
  const now = useNow();
  const [task, setTask] = useState<Task | null>(null);
  const [loadFailure, setLoadFailure] = useState<Failure | null>(null);

  const loadTask = useCallback(async () => {
    try {
      const response = await getOneTask(taskId);
      setTask(response.data.data.task);
      setLoadFailure(null);
    } catch (error) {
      setLoadFailure(describeFailure(error, "Couldn't open this task's comments."));
    }
  }, [taskId]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

  const isArchived = task?.project?.state === "archived";

  let body;
  if (loadFailure) {
    body = (
      <FailurePanel
        failure={loadFailure.kind === "missing" ? { ...loadFailure, message: "It may have been deleted, or it belongs to a workspace you're no longer a member of." } : loadFailure}
        onRetry={loadTask}
        action={<Button variant="secondary" onClick={onClose}>Close</Button>}
      />
    );
  } else if (!task) {
    body = (
      <div role="status" aria-label="Loading comments" className="flex flex-col gap-4">
        <span className="skeleton h-8 w-3/4" />
        <span className="skeleton h-5 w-1/2" />
        <span className="skeleton h-28" />
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-6 pb-2">
        <header className="flex flex-col gap-3">
          {task.project && (
            <span className="inline-flex items-center gap-1.5 text-[14px] text-muted">
              <FolderOpen size={15} aria-hidden="true" />
              {task.project.name}
              {isArchived && <span>(archived)</span>}
            </span>
          )}
          <h3 className="text-[20px] font-semibold leading-snug text-ink">{task.title}</h3>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <StatusBadge status={task.status} />
            <AssigneeChip task={task} />
            <DueLabel task={task} now={now} />
          </div>
          {task.description && (
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-[12px] bg-surface-muted px-4 py-3 text-[14.5px] leading-relaxed text-ink">
              {task.description}
            </p>
          )}
        </header>

        {/* Subtask comments are hidden for now; the discussion happens on the parent task. */}
        {task.parent ? (
          <Notice tone="neutral">
            Subtasks are discussed on their task.{" "}
            <button type="button" onClick={() => onOpenComments(task.parent!.id)} className="inline-flex cursor-pointer items-center gap-1 font-semibold underline underline-offset-2">
              <ArrowUpLeft size={14} aria-hidden="true" />
              Comments on {task.parent.title}
            </button>
          </Notice>
        ) : (
          <TaskComments
            taskId={task.id}
            readOnlyReason={isArchived ? "This task's project is archived, so its discussion is read-only. Restore the project to comment." : null}
          />
        )}
      </div>
    );
  }

  return (
    <Dialog
      open
      variant="sheet"
      onClose={onClose}
      title="Comments"
      headerActions={
        <Button variant="ghost" size="sm" icon={<PanelRightOpen size={15} aria-hidden="true" />} onClick={() => onOpenTask(taskId)}>
          Open full task
        </Button>
      }
    >
      {body}
    </Dialog>
  );
}
