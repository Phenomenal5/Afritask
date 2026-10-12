"use client";

// TaskDrawer: one task in full — context, details, subtasks, discussion and history.
//
// Saving model, so feedback is always clear:
//  - Status changes save immediately (it's the action people take most).
//  - Everything else is edited as a draft; a sticky bar shows "Unsaved changes" with
//    Save / Discard, then "Saving…" and "Saved".
//  - Closing or leaving with unsaved edits asks first.
//  - If someone else saved first (409), the latest copy loads underneath and YOUR edits
//    stay in the form to review and save again.
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpLeft,
  CircleCheck,
  CloudOff,
  CornerDownRight,
  FolderOpen,
  Lock,
  Trash2,
  UserRound,
} from "lucide-react";
import { getOneTask } from "@/lib/services/taskService";
import { getTaskActivity } from "@/lib/services/activityService";
import { useAuth } from "@/context/AuthContext";
import { useTaskActions, type TaskInput } from "@/context/TaskContext";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { useWorkspaceResources } from "@/context/WorkspaceResourcesContext";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { useStatusChange } from "@/hooks/useStatusChange";
import { useViewer } from "@/hooks/useViewer";
import { useNow } from "@/hooks/useNow";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { canDeleteTask, canEditTask, editBlockedReason } from "@/utils/permissions";
import { PRIORITY_STYLES, TASK_PRIORITIES } from "@/utils/taskMeta";
import { dueFieldError, dueFieldsOf, duePayload, isDueExtension } from "@/utils/dueFields";
import { startFieldError, startFieldsOf, startPayload } from "@/utils/startFields";
import { detectTimezone, formatTimezoneLabel } from "@/utils/timezones";
import { describeFailure, type Failure } from "@/lib/errors";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { DueLabel } from "@/components/ui/Badges";
import { FailurePanel, Notice } from "@/components/ui/States";
import ActivityFeed from "@/components/activity/ActivityFeed";
import StatusSelect from "./StatusSelect";
import LabelPicker from "./LabelPicker";
import SubtaskList from "./SubtaskList";
import ReminderSelect from "./ReminderSelect";
import { DEFAULT_REMINDER, reminderChoiceOf, type ReminderChoice } from "@/utils/reminders";
import TaskComments from "./TaskComments";
import CompletionNoteSection from "./CompletionNoteSection";
import type { Task, TaskPriority } from "@/types/models";

interface DetailForm {
  title: string;
  description: string;
  priority: TaskPriority;
  assigneeMembershipId: string;
  projectId: string;
  dueDate: string;
  dueTime: string;
  startDate: string;
  startTime: string;
  reminderOffset: ReminderChoice;
  labelIds: string[];
  // Only asked when the deadline moves later; optional.
  dueChangeReason: string;
}

// "Tue 10 Mar, 09:00" in the viewer's own clock.
const formatInstant = (instant: string) =>
  new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(instant));

const formOf = (task: Task): DetailForm => ({
  dueChangeReason: "",
  title: task.title,
  description: task.description || "",
  priority: task.priority,
  assigneeMembershipId: task.assigneeMembershipId || "",
  projectId: task.projectId || "",
  ...dueFieldsOf(task),
  ...startFieldsOf(task),
  reminderOffset: reminderChoiceOf(task.reminderOffset),
  labelIds: (task.labels || []).map((label) => label.id).sort(),
});

const sameForm = (first: DetailForm, second: DetailForm) => JSON.stringify(first) === JSON.stringify(second);

type SaveState = "idle" | "saving" | "saved" | "failed";

interface TaskDrawerProps {
  taskId: string;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
}

export default function TaskDrawer({ taskId, onClose, onOpenTask }: TaskDrawerProps) {
  const { user } = useAuth();
  const { workspaces, activeWorkspace, switchWorkspace } = useWorkspaces();
  const { members, projects, labels } = useWorkspaceResources();
  const { updateTask, deleteTask, subscribe } = useTaskActions();
  const changeStatus = useStatusChange();
  const confirm = useConfirm();
  const viewer = useViewer();
  const now = useNow();
  const online = useOnlineStatus();
  const profileTimezone = user?.timezone || detectTimezone();

  const [task, setTask] = useState<Task | null>(null);
  const [loadFailure, setLoadFailure] = useState<Failure | null>(null);
  const [form, setForm] = useState<DetailForm | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflictNotice, setConflictNotice] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [historyKey, setHistoryKey] = useState(0);
  const titleRef = useRef<HTMLInputElement>(null);

  const isDirty = !!task && !!form && !sameForm(form, formOf(task));
  const isDirtyRef = useRef(isDirty);
  isDirtyRef.current = isDirty;

  const loadTask = useCallback(async () => {
    try {
      const response = await getOneTask(taskId);
      const loaded: Task = response.data.data.task;
      setTask(loaded);
      // Keep the person's unsaved edits if a reload lands underneath them.
      setForm((currentForm) => (currentForm && isDirtyRef.current ? currentForm : formOf(loaded)));
      setLoadFailure(null);
    } catch (error) {
      setLoadFailure(describeFailure(error, "Couldn't open this task."));
    }
  }, [taskId]);

  useEffect(() => {
    loadTask();
  }, [loadTask]);

  // Stable per task, or the feed would refetch on every render.
  const loadHistory = useCallback((page: { before?: string }) => getTaskActivity(taskId, page), [taskId]);

  // Stay in step with changes made elsewhere (board drag, a subtask toggle, a conflict).
  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === "remove" && event.taskId === taskId) {
          setDeleted(true);
          return;
        }
        if (event.type === "upsert" && event.task.id === taskId) {
          setTask((current) => (current ? { ...event.task, subtasks: current.subtasks } : event.task));
          if (!isDirtyRef.current) setForm(formOf(event.task));
          setHistoryKey((key) => key + 1);
          return;
        }
        if (event.type === "stale" || (event.type === "upsert" && event.task.parentTaskId === taskId) || event.type === "created") {
          loadTask();
          setHistoryKey((key) => key + 1);
        }
      }),
    [subscribe, taskId, loadTask]
  );

  // Leaving the page with unsaved edits: the browser asks first.
  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);

  const requestClose = useCallback(async () => {
    if (isDirtyRef.current) {
      const discard = await confirm({
        title: "Discard your unsaved changes?",
        body: <p>The edits you made to this task haven&apos;t been saved. If you close now, they&apos;ll be lost.</p>,
        confirmLabel: "Discard changes",
        cancelLabel: "Keep editing",
        tone: "danger",
      });
      if (!discard) return;
    }
    onClose();
  }, [confirm, onClose]);

  const openOther = useCallback(
    async (otherTaskId: string) => {
      if (isDirtyRef.current) {
        const discard = await confirm({
          title: "Discard your unsaved changes?",
          body: <p>Opening another task will drop the edits you haven&apos;t saved here.</p>,
          confirmLabel: "Discard and open",
          cancelLabel: "Keep editing",
          tone: "danger",
        });
        if (!discard) return;
      }
      onOpenTask(otherTaskId);
    },
    [confirm, onOpenTask]
  );

  const viewerCanEdit = task ? canEditTask(viewer, task) : false;
  const viewerCanDelete = task ? canDeleteTask(viewer, task) : false;
  const blockedReason = task ? editBlockedReason(viewer, task) : null;
  const isSubtask = !!task?.parentTaskId;
  const isArchived = task?.project?.state === "archived";
  const otherWorkspace = task && activeWorkspace && task.workspaceId !== activeWorkspace.id
    ? workspaces.find((workspace: { id: string }) => workspace.id === task.workspaceId)
    : null;

  const activeProjects = useMemo(() => projects.filter((project) => project.state !== "archived"), [projects]);
  const dueError = form ? dueFieldError(form) : null;
  const startError = form ? startFieldError(form) : null;
  const titleError = form && !form.title.trim() ? "A task needs a title." : form && form.title.trim().length > 200 ? "Keep the title under 200 characters." : null;

  const handleSave = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!task || !form || !isDirty) return;
    if (titleError) {
      titleRef.current?.focus();
      return;
    }
    if (dueError || startError) return;

    const original = formOf(task);
    const changes: TaskInput = {};
    if (form.title.trim() !== original.title) changes.title = form.title.trim();
    if (form.description !== original.description) changes.description = form.description;
    if (form.priority !== original.priority) changes.priority = form.priority;
    if (form.assigneeMembershipId !== original.assigneeMembershipId) changes.assigneeMembershipId = form.assigneeMembershipId || null;
    // A subtask follows its parent's project — the server refuses moving it alone.
    if (!isSubtask && form.projectId !== original.projectId) changes.projectId = form.projectId || null;
    if (JSON.stringify(form.labelIds) !== JSON.stringify(original.labelIds)) changes.labelIds = form.labelIds;
    Object.assign(changes, duePayload(form, profileTimezone, task));
    Object.assign(changes, startPayload(form, profileTimezone, task));
    // Sent whenever it differs, and always when a deadline is first added, so the server
    // never substitutes its default for what the picker showed.
    if (form.dueDate && (form.reminderOffset !== original.reminderOffset || !original.dueDate)) changes.reminderOffset = form.reminderOffset;
    if (isDueExtension(original, form) && form.dueChangeReason.trim()) changes.dueChangeReason = form.dueChangeReason.trim();

    setSaveState("saving");
    setSaveError(null);
    setConflictNotice(false);
    const result = await updateTask(task, changes);
    if (result.success && result.data) {
      setTask((current) => (current ? { ...result.data!, subtasks: current.subtasks } : result.data!));
      setForm(formOf(result.data));
      setSaveState("saved");
      setHistoryKey((key) => key + 1);
      return;
    }
    setSaveState("failed");
    if (result.conflict) setConflictNotice(true);
    else setSaveError(result.message ?? "Couldn't save. Your changes are still here.");
  };

  const handleDelete = async () => {
    if (!task) return;
    const subtaskCount = task.subtaskCounts?.total ?? 0;
    const confirmed = await confirm({
      title: `Delete “${task.title}”?`,
      body: (
        <div className="flex flex-col gap-2">
          <p>This removes the task for everyone in the workspace. It can&apos;t be undone.</p>
          {subtaskCount > 0 && (
            <p className="font-semibold">
              Its {subtaskCount} subtask{subtaskCount === 1 ? "" : "s"} will be deleted too.
            </p>
          )}
          <p className="text-muted">The activity history keeps a record that it was deleted, and by whom.</p>
        </div>
      ),
      confirmLabel: "Delete task",
      cancelLabel: "Keep task",
      tone: "danger",
    });
    if (!confirmed) return;
    const result = await deleteTask(task);
    if (result.success) onClose();
  };

  const updateField = <Key extends keyof DetailForm>(key: Key, value: DetailForm[Key]) => {
    setForm((current) => {
      if (!current) return current;
      const next = { ...current, [key]: value };
      // Giving an undated task a deadline offers the default reminder (what the server
      // would apply), so the picker shows what will actually happen.
      if (key === "dueDate" && value && !current.dueDate && current.reminderOffset === "none" && !task?.reminderOffset) {
        next.reminderOffset = DEFAULT_REMINDER;
      }
      return next;
    });
    if (saveState !== "saving") setSaveState("idle");
  };

  // ─── Render states ─────────────────────

  const title = task ? (isSubtask ? "Subtask" : "Task") : "Task";

  let body: ReactNode;
  if (deleted) {
    body = (
      <FailurePanel
        failure={{ kind: "missing", status: 404, message: "This task was just deleted. Its history is kept in the workspace activity." }}
        action={<Button variant="secondary" onClick={onClose}>Close</Button>}
      />
    );
  } else if (loadFailure) {
    const message =
      loadFailure.kind === "missing"
        ? "It may have been deleted, or it belongs to a workspace you're no longer a member of."
        : loadFailure.message;
    body = (
      <FailurePanel
        failure={{ ...loadFailure, message }}
        onRetry={loadTask}
        action={<Button variant="secondary" onClick={onClose}>Close</Button>}
      />
    );
  } else if (!task || !form) {
    body = (
      <div role="status" aria-label="Loading task" className="flex flex-col gap-5">
        <span className="skeleton h-9 w-3/4" />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((index) => (
            <span key={index} className="skeleton h-16" />
          ))}
        </div>
        <span className="skeleton h-28" />
      </div>
    );
  } else {
    body = (
      <div className="flex flex-col gap-7 pb-2">
        {/* Where this task sits */}
        <nav aria-label="Task context" className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[14px] text-muted">
          <span>{activeWorkspace?.name}</span>
          {task.project && (
            <Link href={`/projects/${task.project.id}`} className="inline-flex items-center gap-1.5 rounded font-medium text-forest hover:underline">
              <FolderOpen size={15} aria-hidden="true" />
              {task.project.name}
              {isArchived && <span className="font-normal text-muted">(archived)</span>}
            </Link>
          )}
          {task.parent && (
            <button type="button" onClick={() => openOther(task.parent!.id)} className="inline-flex cursor-pointer items-center gap-1.5 rounded font-medium text-forest hover:underline">
              <ArrowUpLeft size={15} aria-hidden="true" />
              Subtask of {task.parent.title}
            </button>
          )}
        </nav>

        {otherWorkspace && (
          <Notice icon={FolderOpen} tone="warning">
            This task is in <strong>{otherWorkspace.name}</strong>, not the workspace you have open.{" "}
            <button type="button" className="cursor-pointer font-semibold underline underline-offset-2" onClick={() => switchWorkspace(task.workspaceId)}>
              Switch to {otherWorkspace.name}
            </button>
          </Notice>
        )}

        {blockedReason && (
          <Notice icon={Lock} tone="neutral">
            {blockedReason}
          </Notice>
        )}

        {!online && (
          <Notice icon={CloudOff} tone="warning">
            You&apos;re offline. You can keep reading, but changes can&apos;t be saved until you reconnect.
          </Notice>
        )}

        {/* NOTE: the form wraps only the editable details — the subtask "Add" form below
            must not be nested inside it (nested forms are invalid HTML). */}
        <form id="task-detail-form" onSubmit={handleSave} noValidate className="flex flex-col gap-7">
        <TextField
          ref={titleRef}
          label="Title"
          hideLabel
          value={form.title}
          onChange={(event) => updateField("title", event.target.value)}
          disabled={!viewerCanEdit}
          error={titleError}
          className="min-h-12! border-transparent! bg-transparent! px-2! text-[22px]! font-semibold leading-snug hover:border-line! focus:border-forest! disabled:bg-transparent! disabled:text-ink!"
        />

        {/* Status first: it's what changes most, and it saves on its own. */}
        <section aria-labelledby="task-status-heading" className="flex flex-wrap items-center gap-3 rounded-[12px] bg-surface-muted px-4 py-3">
          <h3 id="task-status-heading" className="text-[14px] font-medium text-ink">
            Status
          </h3>
          <StatusSelect
            status={task.status}
            taskTitle={task.title}
            disabled={!viewerCanEdit || !online}
            disabledReason={blockedReason}
            onChange={(nextStatus) => changeStatus(task, nextStatus)}
          />
          <span className="text-[13px] text-muted">Saves as soon as you change it.</span>
          {task.status === "completed" && task.completedAt && (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-done">
              <CircleCheck size={14} aria-hidden="true" />
              Completed {new Date(task.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          )}
        </section>

        <CompletionNoteSection task={task} canEdit={viewerCanEdit && online} />

        <section aria-label="Details" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="Assignee"
            value={form.assigneeMembershipId}
            onChange={(event) => updateField("assigneeMembershipId", event.target.value)}
            disabled={!viewerCanEdit}
            hint={!form.assigneeMembershipId ? "No one is responsible for this yet." : undefined}
          >
            <option value="">Unassigned</option>
            {/* Keep a since-removed assignee visible rather than silently showing "Unassigned". */}
            {task.assignee && !members.some((member) => member.id === task.assigneeMembershipId) && (
              <option value={task.assigneeMembershipId ?? ""}>{task.assignee.user.name}</option>
            )}
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.user.name}
                {member.user.id === user?.id ? " (you)" : ""}
              </option>
            ))}
          </SelectField>

          <SelectField label="Priority" value={form.priority} onChange={(event) => updateField("priority", event.target.value as TaskPriority)} disabled={!viewerCanEdit}>
            {TASK_PRIORITIES.map((priority: TaskPriority) => (
              <option key={priority} value={priority}>
                {PRIORITY_STYLES[priority].label}
              </option>
            ))}
          </SelectField>

          {isSubtask && task.parent && (task.parent.startAt || task.parent.dueAt) && (
            <p className="text-[13.5px] leading-relaxed text-muted sm:col-span-2">
              Must fit within its task{task.parent.startAt ? `, which starts ${formatInstant(task.parent.startAt)}` : ""}
              {task.parent.dueAt ? ` and is due ${formatInstant(task.parent.dueAt)}` : ""}. Timed subtasks can&apos;t add up to more than the task&apos;s own time.
            </p>
          )}

          <TextField
            label="Start date"
            optional
            type="date"
            value={form.startDate}
            onChange={(event) => updateField("startDate", event.target.value)}
            disabled={!viewerCanEdit}
            error={startError}
            hint={form.startDate ? "You'll get a reminder the day before, so you can prepare." : "When work is planned to begin."}
          />
          <TextField
            label="Start time"
            optional
            type="time"
            value={form.startTime}
            onChange={(event) => updateField("startTime", event.target.value)}
            disabled={!viewerCanEdit || !form.startDate}
          />
          <TextField
            label="Due date"
            type="date"
            value={form.dueDate}
            onChange={(event) => updateField("dueDate", event.target.value)}
            disabled={!viewerCanEdit}
            error={dueError}
            hint={form.dueDate && !form.dueTime ? `End of that day, ${formatTimezoneLabel(profileTimezone)}.` : !form.dueDate ? "No due date." : undefined}
          />
          <TextField
            label="Time"
            optional
            type="time"
            value={form.dueTime}
            onChange={(event) => updateField("dueTime", event.target.value)}
            disabled={!viewerCanEdit || !form.dueDate}
          />
          <div className="sm:col-span-2">
            <ReminderSelect
              value={form.reminderOffset}
              onChange={(choice) => updateField("reminderOffset", choice)}
              hasDueDate={!!form.dueDate}
              hasDueTime={!!form.dueTime}
              disabled={!viewerCanEdit}
            />
          </div>

          {isDueExtension(dueFieldsOf(task), form) && (
            <TextField
              label="Why is the deadline moving?"
              optional
              wrapperClassName="sm:col-span-2"
              maxLength={500}
              value={form.dueChangeReason}
              onChange={(event) => updateField("dueChangeReason", event.target.value)}
              placeholder="e.g. Waiting on the client's figures"
              hint="Shown in the task's history. Extensions also count in your monthly summary."
            />
          )}

          {isSubtask ? (
            <p className="text-[14px] leading-relaxed text-muted sm:col-span-2">
              <CornerDownRight size={15} aria-hidden="true" className="mr-1 inline" />
              Subtasks always live in their parent&apos;s project. Move the parent to move this one.
            </p>
          ) : (
            <SelectField
              label="Project"
              wrapperClassName="sm:col-span-2"
              value={form.projectId}
              onChange={(event) => updateField("projectId", event.target.value)}
              disabled={!viewerCanEdit}
              hint={(task.subtaskCounts?.total ?? 0) > 0 ? "Moving this task moves its subtasks with it." : undefined}
            >
              <option value="">No project</option>
              {task.project && isArchived && <option value={task.project.id}>{task.project.name} (archived)</option>}
              {activeProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </SelectField>
          )}

          <div className="sm:col-span-2">
            <LabelPicker labels={labels} selectedIds={form.labelIds} onChange={(labelIds) => updateField("labelIds", [...labelIds].sort())} disabled={!viewerCanEdit} />
          </div>

          <TextAreaField
            label="Description"
            wrapperClassName="sm:col-span-2"
            rows={5}
            maxLength={20000}
            value={form.description}
            onChange={(event) => updateField("description", event.target.value)}
            disabled={!viewerCanEdit}
            placeholder={viewerCanEdit ? "Add context, links, or what 'done' looks like." : "No description."}
          />
        </section>
        </form>

        {!isSubtask && <SubtaskList parent={task} onOpenSubtask={openOther} />}

        {/* Comments are hidden on subtasks for now (owner's call, 2026-10-12); the discussion
            happens on the parent task. Existing subtask comments stay in the database. */}
        {!isSubtask && (
          <TaskComments
            taskId={task.id}
            readOnlyReason={isArchived ? "This task's project is archived, so its discussion is read-only. Restore the project to comment." : null}
          />
        )}

        <section aria-labelledby="task-activity-heading">
          <h3 id="task-activity-heading" className="mb-3 text-[16px] font-semibold text-ink">
            Activity
          </h3>
          <ActivityFeed
            loadPage={loadHistory}
            reloadKey={`${task.version}-${historyKey}`}
            emptyTitle="No changes yet"
            emptyMessage="Every change to this task (status, assignee, due date and more) is recorded here."
          />
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-5 text-[13px] text-muted">
          <span className="inline-flex items-center gap-1.5">
            <UserRound size={14} aria-hidden="true" />
            {task.assignee ? `Assigned to ${task.assignee.user.name}` : "Unassigned"} · <DueLabel task={task} now={now} />
          </span>
          {viewerCanDelete ? (
            <Button variant="danger" size="sm" icon={<Trash2 size={15} aria-hidden="true" />} onClick={handleDelete} disabled={!online}>
              Delete task
            </Button>
          ) : (
            !isArchived && <span>Only its creator, an Admin or the Owner can delete this task.</span>
          )}
        </footer>
      </div>
    );
  }

  // The save bar appears only while there's something to save or report.
  const showSaveBar = !!task && !!form && !deleted && (isDirty || saveState === "saving" || saveState === "saved" || saveState === "failed");

  return (
    <Dialog
      open
      variant="sheet"
      onClose={requestClose}
      title={title}
      footer={
        showSaveBar ? (
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <div aria-live="polite" className="min-w-0 flex-1 text-[14px]">
              {conflictNotice ? (
                <span className="text-ink">
                  Someone else changed this task. The latest version is loaded and <strong>your edits are still here</strong>. Review them and save again.
                </span>
              ) : saveState === "saving" ? (
                <span className="text-muted">Saving...</span>
              ) : saveState === "saved" && !isDirty ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-done">
                  <CircleCheck size={16} aria-hidden="true" />
                  All changes saved
                </span>
              ) : saveState === "failed" && saveError ? (
                <span className="text-brick">{saveError}</span>
              ) : (
                <span className="font-medium text-ink">You have unsaved changes</span>
              )}
            </div>
            {isDirty && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setForm(formOf(task!));
                    setSaveState("idle");
                    setConflictNotice(false);
                  }}
                  disabled={saveState === "saving"}
                >
                  Discard
                </Button>
                <Button type="submit" form="task-detail-form" loading={saveState === "saving"} disabled={!online || !!titleError || !!dueError || !!startError}>
                  {saveState === "failed" ? "Try again" : "Save changes"}
                </Button>
              </div>
            )}
          </div>
        ) : undefined
      }
    >
      {body}
    </Dialog>
  );
}
