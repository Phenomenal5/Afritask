import AppError from "./AppError.js";

// ─── Subtasks fit inside their task ─────────────────────
// Only enforced where times are actually set, so it stays flexible:
// - a subtask can't start before its task starts, or be due after its task is due;
// - when the task has both a start and a due time, its subtasks' durations (those with
//   both a start and a due) can't add up to more than the task's own duration.
//   A 4-hour task fits four 1-hour subtasks, not four 1.5-hour ones.

export interface ScheduleWindow {
    startAt: Date | null;
    dueAt: Date | null;
}

const durationOf = (window: ScheduleWindow) => (window.startAt && window.dueAt ? window.dueAt.getTime() - window.startAt.getTime() : 0);

// "4 h", "1 h 30 min", "45 min".
export const formatDuration = (milliseconds: number) => {
    const totalMinutes = Math.round(milliseconds / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} min`;
    return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
};

// One subtask inside its task's window.
export const assertSubtaskInsideTask = (task: ScheduleWindow, subtask: ScheduleWindow & { title?: string }) => {
    const name = subtask.title ? `"${subtask.title}"` : "This subtask";
    if (task.dueAt && subtask.dueAt && subtask.dueAt.getTime() > task.dueAt.getTime()) {
        throw new AppError(`${name} is due after its task. Move it earlier, or give the task more time first.`, 400, "subtask_outside_task");
    }
    if (task.dueAt && subtask.startAt && subtask.startAt.getTime() > task.dueAt.getTime()) {
        throw new AppError(`${name} starts after its task is due. Move it earlier.`, 400, "subtask_outside_task");
    }
    if (task.startAt && subtask.startAt && subtask.startAt.getTime() < task.startAt.getTime()) {
        throw new AppError(`${name} starts before its task does. Move it later, or start the task earlier first.`, 400, "subtask_outside_task");
    }
    if (task.startAt && subtask.dueAt && subtask.dueAt.getTime() < task.startAt.getTime()) {
        throw new AppError(`${name} is due before its task starts. Move it later.`, 400, "subtask_outside_task");
    }
};

// All the task's subtasks together within the task's own duration.
export const assertSubtasksFitDuration = (task: ScheduleWindow, subtasks: ScheduleWindow[]) => {
    const taskDuration = durationOf(task);
    if (!taskDuration) return;
    const subtasksTotal = subtasks.reduce((total, subtask) => total + durationOf(subtask), 0);
    if (subtasksTotal > taskDuration) {
        throw new AppError(
            `Subtasks can't take longer than their task. The task is ${formatDuration(taskDuration)}, and its subtasks would add up to ${formatDuration(subtasksTotal)}.`,
            400,
            "subtasks_exceed_task"
        );
    }
};

// A task's window changing: every subtask must still fit, one by one and in total.
export const assertTaskWindowHoldsSubtasks = (task: ScheduleWindow, subtasks: (ScheduleWindow & { title: string })[]) => {
    for (const subtask of subtasks) {
        try {
            assertSubtaskInsideTask(task, subtask);
        } catch (error) {
            if (error instanceof AppError) {
                throw new AppError(`The new time doesn't fit the subtask "${subtask.title}". Change that subtask first.`, 400, "subtask_outside_task");
            }
            throw error;
        }
    }
    assertSubtasksFitDuration(task, subtasks);
};
