"use client";

// Create or edit a project's name and description (Owner/Admin — the server enforces it).
import { useEffect, useRef, useState, type FormEvent } from "react";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";

const NAME_MAX_LENGTH = 100;

interface ProjectFormDialogProps {
  open: boolean;
  onClose: () => void;
  // Resolves to an error message, or null on success.
  onSubmit: (values: { name: string; description: string }) => Promise<string | null>;
  initialValues?: { name: string; description: string };
  mode: "create" | "edit";
}

export default function ProjectFormDialog({ open, onClose, onSubmit, initialValues, mode }: ProjectFormDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialValues?.name ?? "");
    setDescription(initialValues?.description ?? "");
    setNameError(null);
    setFormError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError("Give the project a name people will recognise.");
      nameRef.current?.focus();
      return;
    }
    if (trimmedName.length > NAME_MAX_LENGTH) {
      setNameError(`Keep the name under ${NAME_MAX_LENGTH} characters.`);
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    const error = await onSubmit({ name: trimmedName, description: description.trim() });
    setSaving(false);
    if (error) setFormError(error);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={mode === "create" ? "New project" : "Edit project"}
      description={mode === "create" ? "A project groups related tasks. Everyone in the workspace can see it." : undefined}
      initialFocusRef={nameRef}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="project-form" loading={saving}>
            {mode === "create" ? "Create project" : "Save changes"}
          </Button>
        </>
      }
    >
      <form id="project-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError && (
          <p role="alert" className="rounded-[10px] bg-brick-tint px-3.5 py-2.5 text-[14px] text-ink">
            {formError} Your text is still here.
          </p>
        )}
        <TextField
          ref={nameRef}
          label="Name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNameError(null);
          }}
          placeholder="e.g. Website relaunch"
          error={nameError}
          required
        />
        <TextAreaField
          label="Description"
          optional
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What is this project for? What does done look like?"
        />
      </form>
    </Dialog>
  );
}
