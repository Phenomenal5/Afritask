"use client";

// Board view: top-level tasks grouped by the four fixed statuses (PRD FR12). Dragging a
// card is a shortcut; every card also has its Status menu, so the board works fully by
// keyboard and on touch screens where drag-and-drop isn't available.
import { useState, type DragEvent } from "react";
import { GripVertical } from "lucide-react";
import { useTaskPanels } from "@/context/TaskPanelContext";
import { useStatusChange } from "@/hooks/useStatusChange";
import { useViewer } from "@/hooks/useViewer";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { canEditTask, editBlockedReason } from "@/utils/permissions";
import { STATUS_LABELS, TASK_STATUSES } from "@/utils/taskMeta";
import { cx } from "@/lib/cx";
import { DueLabel, PriorityBadge, STATUS_META } from "@/components/ui/Badges";
import StatusSelect from "./StatusSelect";
import { AssigneeChip, LabelChips, ParentContext, ProjectTag, SubtaskProgress } from "./TaskMeta";
import type { Task, TaskStatus } from "@/types/models";

const DRAG_TYPE = "application/x-afritask-task";

interface TaskBoardProps {
  tasks: Task[];
  now: Date | null;
  showProject?: boolean;
}

export default function TaskBoard({ tasks, now, showProject = true }: TaskBoardProps) {
  const changeStatus = useStatusChange();
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);

  const handleDrop = (event: DragEvent, status: TaskStatus) => {
    event.preventDefault();
    setDropTarget(null);
    const taskId = event.dataTransfer.getData(DRAG_TYPE);
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (task) changeStatus(task, status);
  };

  return (
    // Columns scroll sideways inside this region on small screens — never the page.
    // NOTE: `relative` matters: without it the absolutely positioned sr-only labels inside
    // escape this scroller and widen the whole page on phones.
    <div className="relative -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0" role="region" aria-label="Task board" tabIndex={0}>
      <div className="grid min-w-[1080px] grid-cols-4 gap-4">
        {TASK_STATUSES.map((status: TaskStatus) => {
          const columnTasks = tasks.filter((task) => task.status === status);
          const meta = STATUS_META[status];
          const Icon = meta.icon;
          return (
            <section
              key={status}
              aria-labelledby={`column-${status}`}
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(DRAG_TYPE)) return;
                event.preventDefault();
                setDropTarget(status);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(null);
              }}
              onDrop={(event) => handleDrop(event, status)}
              className={cx("flex min-h-[220px] flex-col rounded-[14px] border border-line bg-surface-muted/70 p-2.5 transition-colors", dropTarget === status && "drop-target")}
            >
              <h3 id={`column-${status}`} className="flex items-center gap-2 px-1.5 pb-2.5 pt-1 text-[14px] font-semibold text-ink">
                <Icon size={16} aria-hidden="true" style={{ color: meta.color }} strokeWidth={2.25} />
                {STATUS_LABELS[status]}
                <span className="ml-auto rounded-full bg-surface px-2 text-[12px] font-semibold leading-6 text-muted">
                  {columnTasks.length}
                  <span className="sr-only"> tasks</span>
                </span>
              </h3>
              {columnTasks.length === 0 ? (
                <p className="rounded-[10px] border border-dashed border-line px-3 py-6 text-center text-[13.5px] text-muted">
                  {status === "completed" ? "Finished work lands here." : "Nothing here right now."}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {columnTasks.map((task) => (
                    <BoardCard key={task.id} task={task} now={now} showProject={showProject} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function BoardCard({ task, now, showProject }: { task: Task; now: Date | null; showProject: boolean }) {
  const { openTask } = useTaskPanels();
  const changeStatus = useStatusChange();
  const viewer = useViewer();
  const online = useOnlineStatus();
  const [dragging, setDragging] = useState(false);
  const editable = canEditTask(viewer, task) && online;

  return (
    <li
      draggable={editable}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, task.id);
        event.dataTransfer.effectAllowed = "move";
        setDragging(true);
      }}
      onDragEnd={() => setDragging(false)}
      className={cx(
        "group rounded-[12px] border border-line bg-surface p-3 shadow-sm transition-[box-shadow,opacity]",
        editable && "hover:shadow-md",
        dragging && "opacity-50"
      )}
    >
      <div className="flex items-start gap-1.5">
        {editable && <GripVertical size={16} aria-hidden="true" className="mt-0.5 shrink-0 cursor-grab text-muted opacity-50 group-hover:opacity-100" />}
        <div className="min-w-0 flex-1">
          <ParentContext task={task} />
          <button
            type="button"
            onClick={() => openTask(task.id)}
            className={cx("block cursor-pointer rounded text-left text-[15px] font-medium leading-snug hover:underline", task.status === "completed" ? "text-muted line-through" : "text-ink")}
          >
            {task.title}
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {showProject && <ProjectTag task={task} />}
        <PriorityBadge priority={task.priority} subtle />
        <SubtaskProgress task={task} />
        <LabelChips task={task} max={2} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <DueLabel task={task} now={now} />
        <AssigneeChip task={task} />
      </div>
      <div className="mt-3 border-t border-line-soft pt-2.5">
        <StatusSelect
          status={task.status}
          taskTitle={task.title}
          disabled={!editable}
          disabledReason={online ? editBlockedReason(viewer, task) : "You're offline."}
          onChange={(nextStatus) => changeStatus(task, nextStatus)}
        />
      </div>
    </li>
  );
}
