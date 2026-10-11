"use client";

// In the task drawer, on a completed task: the "what was done" note, and a way to correct
// it. (Reopening clears it; the history keeps every version.)
import { useState } from "react";
import { Pencil } from "lucide-react";
import { useTaskActions } from "@/context/TaskContext";
import Button from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import type { Task } from "@/types/models";

export default function CompletionNoteSection({ task, canEdit }: { task: Task; canEdit: boolean }) {
  const { updateTask } = useTaskActions();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.completionNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (task.status !== "completed") return null;
  // Subtasks may be completed without a note — then there's nothing to show.
  if (!task.completionNote && !canEdit) return null;

  const save = async () => {
    const trimmed = draft.trim();
    if (!trimmed && !task.parentTaskId) return setError("The note can't be empty. Say briefly what was done.");
    setSaving(true);
    const result = await updateTask(task, { completionNote: trimmed });
    setSaving(false);
    if (result.success) setEditing(false);
  };

  return (
    <section aria-labelledby="completion-note-heading" className="rounded-[12px] border border-done/30 bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="completion-note-heading" className="text-[14px] font-medium text-ink">
          What was done
        </h3>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(task.completionNote ?? "");
              setError(null);
              setEditing(true);
            }}
            className="inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-[13px] font-medium text-forest hover:bg-surface-muted"
          >
            <Pencil size={13} aria-hidden="true" />
            {task.completionNote ? "Edit" : "Add a note"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <TextAreaField label="What was done" hideLabel rows={3} maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} error={error} />
          <div className="flex gap-2">
            <Button size="sm" loading={saving} onClick={save}>
              Save note
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        task.completionNote && <p className="mt-1 whitespace-pre-line text-[14.5px] leading-relaxed text-ink">{task.completionNote}</p>
      )}
    </section>
  );
}
