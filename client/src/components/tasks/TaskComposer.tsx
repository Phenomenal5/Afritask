"use client";

// TaskComposer: "New task". Only the title is required; the common details sit in one row
// and the rest open on request (PRD: keep creation quick, expose details progressively).
// What you type is kept as a draft until the task is saved, so closing by accident or a
// failed save never loses it.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ChevronDown, CloudOff, FileText } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTaskActions, type TaskInput } from "@/context/TaskContext";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { useWorkspaceResources } from "@/context/WorkspaceResourcesContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { PRIORITY_STYLES, STATUS_LABELS, TASK_PRIORITIES, TASK_STATUSES } from "@/utils/taskMeta";
import { duePayload, dueFieldError } from "@/utils/dueFields";
import { startFieldError, startPayload } from "@/utils/startFields";
import { DEFAULT_REMINDER, type ReminderChoice } from "@/utils/reminders";
import ReminderSelect from "./ReminderSelect";
import { clearDraft, readDraft, writeDraft } from "@/utils/draftStorage";
import { detectTimezone, formatTimezoneLabel } from "@/utils/timezones";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/States";
import LabelPicker from "./LabelPicker";
import { useCompletionNote } from "./CompletionNoteProvider";
import type { ComposerDefaults } from "@/context/TaskPanelContext";
import type { Task, TaskPriority, TaskStatus } from "@/types/models";

const TITLE_MAX_LENGTH = 200;

interface ComposerForm {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectId: string;
  assigneeMembershipId: string;
  dueDate: string;
  dueTime: string;
  startDate: string;
  startTime: string;
  reminderOffset: ReminderChoice;
  labelIds: string[];
}

const EMPTY_FORM: ComposerForm = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  projectId: "",
  assigneeMembershipId: "",
  dueDate: "",
  dueTime: "",
  startDate: "",
  startTime: "",
  reminderOffset: DEFAULT_REMINDER,
  labelIds: [],
};

// One fresh key per opened form: a double-clicked Save sends the same key twice and the
// server creates the task once (SRS SR06 idempotency).
const newRequestId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const hasContent = (form: ComposerForm) => !!(form.title.trim() || form.description.trim());

interface TaskComposerProps {
  open: boolean;
  defaults: ComposerDefaults;
  onClose: () => void;
  onCreated?: (task: Task) => void;
}

export default function TaskComposer({ open, defaults, onClose, onCreated }: TaskComposerProps) {
  const { user } = useAuth();
  const { activeWorkspace } = useWorkspaces();
  const { members, projects, labels, myMembership } = useWorkspaceResources();
  const { createTask } = useTaskActions();
  const askCompletionNote = useCompletionNote();
  const online = useOnlineStatus();

  const workspaceId: string | undefined = activeWorkspace?.id;
  const draftKey = `afritask_task_draft:${workspaceId}`;
  const profileTimezone = user?.timezone || detectTimezone();

  const [form, setForm] = useState<ComposerForm>(EMPTY_FORM);
  const [showDetails, setShowDetails] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState(false);
  const [requestId, setRequestId] = useState(newRequestId);
  const titleRef = useRef<HTMLInputElement>(null);

  const activeProjects = useMemo(() => projects.filter((project) => project.state !== "archived"), [projects]);

  // Opening: restore a kept draft, otherwise start from the defaults.
  useEffect(() => {
    if (!open) return;
    const draft = readDraft<ComposerForm>(draftKey);
    if (draft && hasContent(draft)) {
      setForm({ ...draft, projectId: defaults.projectId ?? draft.projectId });
      setRestoredDraft(true);
      setShowDetails(!!(draft.description || draft.labelIds.length || draft.dueTime || draft.status !== "todo"));
    } else {
      // PRD J1 default: alone in the workspace → preselect yourself (you can clear it).
      const soloAssignee = members.length === 1 && myMembership ? myMembership.id : "";
      setForm({ ...EMPTY_FORM, projectId: defaults.projectId ?? "", assigneeMembershipId: soloAssignee });
      setRestoredDraft(false);
      setShowDetails(false);
    }
    setTitleError(null);
    setRequestId(newRequestId());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the draft current while typing.
  useEffect(() => {
    if (!open) return;
    if (hasContent(form)) writeDraft(draftKey, form);
    else clearDraft(draftKey);
  }, [open, form, draftKey]);

  const update = <Key extends keyof ComposerForm>(key: Key, value: ComposerForm[Key]) => {
    setForm((current) => ({ ...current, [key]: value }));
    if (key === "title") setTitleError(null);
  };

  const discardDraft = () => {
    clearDraft(draftKey);
    setForm({ ...EMPTY_FORM, projectId: defaults.projectId ?? "" });
    setRestoredDraft(false);
    titleRef.current?.focus();
  };

  const dueError = dueFieldError(form);
  const startError = startFieldError(form);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedTitle = form.title.trim();
    if (!trimmedTitle) {
      setTitleError("Give the task a title. A few words about the next step is enough.");
      titleRef.current?.focus();
      return;
    }
    if (trimmedTitle.length > TITLE_MAX_LENGTH) {
      setTitleError(`Keep the title under ${TITLE_MAX_LENGTH} characters. Put the rest in the description.`);
      titleRef.current?.focus();
      return;
    }
    if (dueError || startError || !workspaceId) return;

    const payload: TaskInput = {
      title: trimmedTitle,
      description: form.description,
      status: form.status,
      priority: form.priority,
      projectId: form.projectId || null,
      assigneeMembershipId: form.assigneeMembershipId || null,
      labelIds: form.labelIds,
      clientRequestId: requestId,
      ...duePayload(form, profileTimezone, null),
      ...startPayload(form, profileTimezone, null),
      // Only meaningful with a deadline; without one the server stores no reminder.
      ...(form.dueDate && { reminderOffset: form.reminderOffset }),
    };

    if (form.status === "completed") {
      const completionNote = await askCompletionNote({ taskTitle: trimmedTitle, openSubtasks: 0, totalSubtasks: 0 });
      if (completionNote === null) return;
      payload.completionNote = completionNote;
    }

    setSaving(true);
    const result = await createTask(workspaceId, payload);
    setSaving(false);
    if (result.success && result.data) {
      clearDraft(draftKey);
      onClose();
      onCreated?.(result.data);
    }
    // On failure the toast explains why, and the form (and draft) stay as they are.
  };

  const descriptionCharsLeft = 20000 - form.description.length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New task"
      description={activeWorkspace ? `Adds to ${activeWorkspace.name}. Only the title is required.` : undefined}
      initialFocusRef={titleRef}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {hasContent(form) ? "Close and keep draft" : "Cancel"}
          </Button>
          <Button type="submit" form="task-composer" loading={saving} disabled={!online}>
            Add task
          </Button>
        </>
      }
    >
      <form id="task-composer" onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        {!online && (
          <Notice icon={CloudOff} tone="warning">
            You&apos;re offline. Your draft is kept on this device, but the task can&apos;t be added until you reconnect.
          </Notice>
        )}
        {restoredDraft && (
          <Notice icon={FileText} tone="lime">
            <span>We kept the draft you hadn&apos;t saved. </span>
            <button type="button" onClick={discardDraft} className="cursor-pointer font-semibold underline underline-offset-2">
              Start fresh instead
            </button>
          </Notice>
        )}

        <TextField
          ref={titleRef}
          label="Title"
          value={form.title}
          onChange={(event) => update("title", event.target.value)}
          placeholder="What's the next step?"
          error={titleError}
          maxLength={TITLE_MAX_LENGTH + 50}
          autoComplete="off"
          required
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Assignee" value={form.assigneeMembershipId} onChange={(event) => update("assigneeMembershipId", event.target.value)}>
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.user.name}
                {member.user.id === user?.id ? " (you)" : ""}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Project"
            value={form.projectId}
            onChange={(event) => update("projectId", event.target.value)}
            hint={activeProjects.length === 0 ? "No projects yet, so the task stays in the workspace." : undefined}
          >
            <option value="">No project</option>
            {activeProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Start date"
            optional
            type="date"
            value={form.startDate}
            onChange={(event) => update("startDate", event.target.value)}
            hint={form.startDate ? "You'll get a reminder the day before, so you can prepare." : "When you plan to begin. Leave it empty to start any time."}
            error={startError}
          />
          <TextField
            label="Due date"
            optional
            type="date"
            value={form.dueDate}
            onChange={(event) => update("dueDate", event.target.value)}
            hint={form.dueDate && !form.dueTime ? `Due by the end of that day (${formatTimezoneLabel(profileTimezone)}).` : undefined}
            error={dueError}
          />
          <SelectField label="Priority" value={form.priority} onChange={(event) => update("priority", event.target.value as TaskPriority)}>
            {TASK_PRIORITIES.map((priority: TaskPriority) => (
              <option key={priority} value={priority}>
                {PRIORITY_STYLES[priority].label}
              </option>
            ))}
          </SelectField>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowDetails((shown) => !shown)}
            aria-expanded={showDetails}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[8px] text-[15px] font-medium text-forest hover:underline"
          >
            <ChevronDown size={17} aria-hidden="true" className={showDetails ? "rotate-180 transition-transform" : "transition-transform"} />
            {showDetails ? "Fewer details" : "More details: description, times, reminder, status, labels"}
          </button>
        </div>

        {showDetails && (
          <div className="flex flex-col gap-4 animate-fade-in">
            <TextAreaField
              label="Description"
              optional
              rows={4}
              value={form.description}
              onChange={(event) => update("description", event.target.value)}
              placeholder="Context, links, what 'done' looks like"
              maxLength={20000}
              hint={descriptionCharsLeft < 1000 ? `${descriptionCharsLeft} characters left` : undefined}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Time"
                optional
                type="time"
                value={form.dueTime}
                onChange={(event) => update("dueTime", event.target.value)}
                hint="Adds an exact time to the due date, on this device's clock."
              />
              <TextField
                label="Start time"
                optional
                type="time"
                value={form.startTime}
                onChange={(event) => update("startTime", event.target.value)}
                disabled={!form.startDate}
                hint={form.startDate ? "Adds an exact time to the start date." : "Set a start date first."}
              />
              <ReminderSelect
                value={form.reminderOffset}
                onChange={(choice) => update("reminderOffset", choice)}
                hasDueDate={!!form.dueDate}
                hasDueTime={!!form.dueTime}
              />
              <SelectField label="Status" value={form.status} onChange={(event) => update("status", event.target.value as TaskStatus)}>
                {TASK_STATUSES.map((status: TaskStatus) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status]}
                  </option>
                ))}
              </SelectField>
            </div>
            <LabelPicker labels={labels} selectedIds={form.labelIds} onChange={(labelIds) => update("labelIds", labelIds)} />
          </div>
        )}
      </form>
    </Dialog>
  );
}
