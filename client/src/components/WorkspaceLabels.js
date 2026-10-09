"use client";

// WorkspaceLabels: the workspace's labels. Everyone sees them; Owners/Admins create,
// recolor and delete (deleting removes the label from tasks, never the tasks).
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { createLabel, deleteLabel, getWorkspaceLabels, updateLabel } from "@/lib/services/labelService";
import { LABEL_COLORS, labelStyle } from "@/utils/labels";
import FormField from "./FormField";
import Button from "./Button";

const selectStyle = { background: "var(--paper-raised)", border: "1px solid var(--line)", color: "var(--ink)" };

export default function WorkspaceLabels({ workspaceId, canManage }) {
  const [labels, setLabels] = useState([]);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("gray");
  const [saving, setSaving] = useState(false);

  const loadLabels = useCallback(async () => {
    const res = await getWorkspaceLabels(workspaceId);
    setLabels(res.data.data.labels);
  }, [workspaceId]);

  useEffect(() => {
    loadLabels().catch(() => setLabels([]));
  }, [loadLabels]);

  const run = async (action, successMessage) => {
    try {
      await action();
      if (successMessage) toast.success(successMessage);
      await loadLabels();
      return true;
    } catch (err) {
      toast.error(err.response?.data?.message || "Something went wrong");
      return false;
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSaving(true);
    const created = await run(() => createLabel(workspaceId, { name: newName, color: newColor }), "Label created");
    setSaving(false);
    if (created) setNewName("");
  };

  const handleDelete = (label) => {
    const usage = label.taskCount ? ` It will be removed from ${label.taskCount} task(s); the tasks stay.` : "";
    if (!window.confirm(`Delete the label "${label.name}"?${usage}`)) return;
    run(() => deleteLabel(label.id), "Label deleted");
  };

  return (
    <section className="p-5 rounded-xl mb-6" style={{ background: "var(--paper-raised)", border: "1px solid var(--line)" }}>
      <h2 className="font-display text-lg mb-4" style={{ color: "var(--ink)" }}>
        Labels
      </h2>

      {canManage && (
        <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3 sm:items-end mb-5">
          <div className="flex-1">
            <FormField label="New label" name="labelName" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Client, Bug, Design" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="labelColor" className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Color
            </label>
            <select id="labelColor" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="px-3.5 py-2.5 rounded-lg text-sm outline-none" style={selectStyle}>
              {LABEL_COLORS.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" loading={saving}>
            Add label
          </Button>
        </form>
      )}

      {labels.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
          {canManage ? "No labels yet. Labels help you group tasks across projects." : "No labels yet. An Owner or Admin can add some."}
        </p>
      ) : (
        <ul className="flex flex-col">
          {labels.map((label) => (
            <li key={label.id} className="flex items-center gap-3 py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
              <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={labelStyle(label.color)}>
                {label.name}
              </span>
              <span className="text-xs flex-1" style={{ color: "var(--ink-soft)" }}>
                {label.taskCount} task{label.taskCount === 1 ? "" : "s"}
              </span>
              {canManage && (
                <>
                  <select
                    aria-label={`Color for ${label.name}`}
                    value={label.color}
                    onChange={(e) => run(() => updateLabel(label.id, { color: e.target.value }))}
                    className="text-xs px-2 py-1 rounded-md outline-none"
                    style={selectStyle}
                  >
                    {LABEL_COLORS.map((color) => (
                      <option key={color} value={color}>
                        {color}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="secondary" onClick={() => handleDelete(label)}>
                    Delete
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
