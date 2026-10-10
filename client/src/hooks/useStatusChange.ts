"use client";

import { useCallback } from "react";
import { createElement } from "react";
import { useTaskActions } from "@/context/TaskContext";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { STATUS_LABELS } from "@/utils/taskMeta";
import type { Task, TaskStatus } from "@/types/models";

// The one way any view changes a task's status (list select, board drag, drawer).
// NOTE: completing a parent never completes its subtasks (PRD FR07) — so when some are
// still open we say so first, and only an explicit confirm completes the parent alone.
export function useStatusChange() {
  const { updateTaskStatus } = useTaskActions();
  const confirm = useConfirm();

  return useCallback(
    async (task: Task, nextStatus: TaskStatus) => {
      if (task.status === nextStatus) return;
      const openSubtasks = (task.subtaskCounts?.total ?? 0) - (task.subtaskCounts?.completed ?? 0);
      if (nextStatus === "completed" && openSubtasks > 0) {
        const confirmed = await confirm({
          title: `Complete “${task.title}” with open subtasks?`,
          body: createElement(
            "p",
            null,
            `${openSubtasks} of its ${task.subtaskCounts.total} subtasks ${openSubtasks === 1 ? "is" : "are"} not completed. ` +
              `Completing the parent leaves ${openSubtasks === 1 ? "it" : "them"} open and assigned as they are.`
          ),
          confirmLabel: `Mark ${STATUS_LABELS.completed.toLowerCase()} anyway`,
          cancelLabel: "Keep it open",
        });
        if (!confirmed) return;
      }
      await updateTaskStatus(task, nextStatus);
    },
    [confirm, updateTaskStatus]
  );
}
