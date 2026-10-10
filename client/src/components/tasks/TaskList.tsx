"use client";

// List view: one row per task with title, project, status, priority, due date and
// assignee (PRD FR12). Subtasks stay inside their parent — "Show subtasks" expands them.
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { getOneTask } from "@/lib/services/taskService";
import { useTaskPanels } from "@/context/TaskPanelContext";
import { useStatusChange } from "@/hooks/useStatusChange";
import { useViewer } from "@/hooks/useViewer";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { canEditTask, editBlockedReason } from "@/utils/permissions";
import { cx } from "@/lib/cx";
import { DueLabel, PriorityBadge, StatusBadge } from "@/components/ui/Badges";
import StatusSelect from "./StatusSelect";
import { AssigneeChip, LabelChips, ParentContext, ProjectTag, SubtaskProgress } from "./TaskMeta";
import type { Task } from "@/types/models";

interface TaskListProps {
  tasks: Task[];
  now: Date | null;
  showProject?: boolean;
}

const GRID = "lg:grid lg:grid-cols-[minmax(0,1fr)_10.5rem_7rem_9.5rem_11rem] lg:items-center lg:gap-4";

export default function TaskList({ tasks, now, showProject = true }: TaskListProps) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
      <div aria-hidden="true" className={cx("hidden border-b border-line bg-surface-muted px-5 py-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-muted", GRID)}>
        <span>Task</span>
        <span>Status</span>
        <span>Priority</span>
        <span>Due</span>
        <span>Assignee</span>
      </div>
      <ul aria-label="Tasks">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} now={now} showProject={showProject} />
        ))}
      </ul>
    </div>
  );
}

function TaskRow({ task, now, showProject }: { task: Task; now: Date | null; showProject: boolean }) {
  const { openTask } = useTaskPanels();
  const changeStatus = useStatusChange();
  const viewer = useViewer();
  const online = useOnlineStatus();
  const [expanded, setExpanded] = useState(false);
  const [subtasks, setSubtasks] = useState<Task[] | null>(null);
  const [subtasksFailed, setSubtasksFailed] = useState(false);

  const editable = canEditTask(viewer, task) && online;
  const isDone = task.status === "completed";

  const toggleSubtasks = async () => {
    const willExpand = !expanded;
    setExpanded(willExpand);
    if (!willExpand) return;
    try {
      const res = await getOneTask(task.id);
      setSubtasks(res.data.data.task.subtasks ?? []);
      setSubtasksFailed(false);
    } catch {
      setSubtasksFailed(true);
    }
  };

  return (
    <li className="border-t border-line-soft first:border-t-0">
      <div className={cx("flex flex-col gap-2.5 px-4 py-3.5 transition-colors hover:bg-surface-muted/60 sm:px-5", GRID)}>
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => openTask(task.id)}
            className={cx("cursor-pointer rounded text-left text-[15.5px] font-medium leading-snug hover:underline", isDone ? "text-muted line-through" : "text-ink")}
          >
            {task.title}
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <ParentContext task={task} />
            {showProject && <ProjectTag task={task} />}
            <SubtaskProgress task={task} />
            <LabelChips task={task} />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:contents">
          <StatusSelect
            status={task.status}
            taskTitle={task.title}
            disabled={!editable}
            disabledReason={online ? editBlockedReason(viewer, task) : "You're offline."}
            onChange={(nextStatus) => changeStatus(task, nextStatus)}
          />
          <span>
            <PriorityBadge priority={task.priority} subtle />
          </span>
          <DueLabel task={task} now={now} />
          <AssigneeChip task={task} />
        </div>
      </div>

      {task.subtaskCounts?.total > 0 && (
        <div className="px-4 pb-3 sm:px-5">
          <button
            type="button"
            onClick={toggleSubtasks}
            aria-expanded={expanded}
            className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-[8px] px-1 text-[13.5px] font-medium text-forest hover:underline"
          >
            <ChevronDown size={15} aria-hidden="true" className={cx("transition-transform", expanded && "rotate-180")} />
            {expanded ? "Hide subtasks" : `Show ${task.subtaskCounts.total} subtask${task.subtaskCounts.total === 1 ? "" : "s"}`}
          </button>
          {expanded && (
            <div className="mt-1 border-l-2 border-lime-deep pl-4">
              {subtasksFailed ? (
                <p className="py-2 text-[14px] text-brick">Couldn&apos;t load the subtasks. Open the task to see them.</p>
              ) : subtasks === null ? (
                <span role="status" aria-label="Loading subtasks" className="skeleton my-2 block h-4 w-1/2" />
              ) : (
                <ul className="flex flex-col">
                  {subtasks.map((subtask) => (
                    <li key={subtask.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                      <button type="button" onClick={() => openTask(subtask.id)} className={cx("cursor-pointer rounded text-left text-[14.5px] hover:underline", subtask.status === "completed" ? "text-muted line-through" : "text-ink")}>
                        {subtask.title}
                      </button>
                      <StatusBadge status={subtask.status} />
                      <AssigneeChip task={subtask} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
