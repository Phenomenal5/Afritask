"use client";

// The workspace's labels. Everyone sees them; Owners/Admins create, recolour and delete.
// Deleting a label removes it from tasks — never the tasks themselves.
import { useState, type FormEvent } from "react";
import toast from "react-hot-toast";
import { Plus, Tag, Trash2 } from "lucide-react";
import { createLabel, deleteLabel, updateLabel } from "@/lib/services/labelService";
import { useWorkspaceResources } from "@/context/WorkspaceResourcesContext";
import { useConfirm } from "@/components/ui/ConfirmProvider";
import { failureMessage } from "@/lib/errors";
import { LABEL_COLORS, labelStyle } from "@/utils/labels";
import Button from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import type { Label } from "@/types/models";

const COLOR_NAMES: Record<string, string> = { gray: "Stone", moss: "Moss", clay: "Clay", gold: "Gold", sky: "Sky", plum: "Plum" };
const LABEL_NAME_MAX = 40;

export default function LabelsManager({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const { labels, reloadLabels } = useWorkspaceResources();
  const confirm = useConfirm();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("moss");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = newName.trim();
    if (!trimmedName) return setNameError("Name the label, e.g. Client or Bug.");
    if (trimmedName.length > LABEL_NAME_MAX) return setNameError(`Keep it under ${LABEL_NAME_MAX} characters.`);
    setSaving(true);
    try {
      await createLabel(workspaceId, { name: trimmedName, color: newColor });
      toast.success(`Label “${trimmedName}” added`);
      setNewName("");
      await reloadLabels();
    } catch (error) {
      setNameError(failureMessage(error, "Couldn't add the label."));
    } finally {
      setSaving(false);
    }
  };

  const handleRecolor = async (label: Label, color: string) => {
    try {
      await updateLabel(label.id, { color });
      await reloadLabels();
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't change the colour."));
    }
  };

  const handleDelete = async (label: Label) => {
    const confirmed = await confirm({
      title: `Delete the label “${label.name}”?`,
      body: (
        <p>
          {label.taskCount
            ? `It will be removed from ${label.taskCount} task${label.taskCount === 1 ? "" : "s"}. The tasks themselves stay exactly as they are.`
            : "It isn't on any tasks, so nothing else changes."}
        </p>
      ),
      confirmLabel: "Delete label",
      cancelLabel: "Keep it",
      tone: "danger",
    });
    if (!confirmed) return;
    try {
      await deleteLabel(label.id);
      toast.success(`Label “${label.name}” deleted`);
      await reloadLabels();
    } catch (error) {
      toast.error(failureMessage(error, "Couldn't delete the label."));
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {canManage && (
        <form onSubmit={handleCreate} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <TextField
            wrapperClassName="flex-1"
            label="New label"
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
              setNameError(null);
            }}
            placeholder="e.g. Client, Bug, Design"
            error={nameError}
          />
          <SelectField label="Colour" wrapperClassName="sm:w-36" value={newColor} onChange={(event) => setNewColor(event.target.value)}>
            {LABEL_COLORS.map((color: string) => (
              <option key={color} value={color}>
                {COLOR_NAMES[color] ?? color}
              </option>
            ))}
          </SelectField>
          <Button type="submit" variant="secondary" loading={saving} className="sm:mt-[27px]" icon={<Plus size={16} aria-hidden="true" />}>
            Add label
          </Button>
        </form>
      )}

      {labels.length === 0 ? (
        <p className="flex items-center gap-2 rounded-[10px] bg-surface-muted px-4 py-3 text-[14px] text-muted">
          <Tag size={16} aria-hidden="true" />
          {canManage ? "No labels yet. Labels group tasks across projects, for example Client, Bug or Waiting." : "No labels yet. An Owner or Admin can add some."}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-[12px] border border-line">
          {labels.map((label) => (
            <li key={label.id} className="flex flex-wrap items-center gap-3 border-t border-line-soft bg-surface px-4 py-3 first:border-t-0">
              <span className="rounded-full px-2.5 text-[14px] font-medium leading-7" style={labelStyle(label.color)}>
                {label.name}
              </span>
              <span className="flex-1 text-[13.5px] text-muted">
                On {label.taskCount ?? 0} task{label.taskCount === 1 ? "" : "s"}
              </span>
              {canManage && (
                <>
                  <label htmlFor={`label-color-${label.id}`} className="sr-only">
                    Colour for {label.name}
                  </label>
                  <select id={`label-color-${label.id}`} value={label.color} onChange={(event) => handleRecolor(label, event.target.value)} className="field-control field-compact w-auto">
                    {LABEL_COLORS.map((color: string) => (
                      <option key={color} value={color}>
                        {COLOR_NAMES[color] ?? color}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(label)} aria-label={`Delete label ${label.name}`} icon={<Trash2 size={15} aria-hidden="true" />}>
                    Delete
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
