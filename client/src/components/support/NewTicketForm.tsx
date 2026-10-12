"use client";

// Write to Afritask support: a topic, a subject and the message. Used on the support page
// (full) and on the overview (compact, subject + message only).
import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";
import { openTicket } from "@/lib/services/supportService";
import { useWorkspaces } from "@/context/WorkspaceContext";
import { failureMessage } from "@/lib/errors";
import Button from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { CATEGORY_LABELS } from "./supportLabels";
import type { SupportTicket, SupportTicketCategory } from "@/types/models";

const EMPTY_FORM = { subject: "", category: "question" as SupportTicketCategory, message: "" };

interface NewTicketFormProps {
  compact?: boolean;
  onOpened: (ticket: SupportTicket) => void;
}

export default function NewTicketForm({ compact = false, onOpened }: NewTicketFormProps) {
  const { activeWorkspace } = useWorkspaces();
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState<{ subject?: string; message?: string; form?: string }>({});
  const [sending, setSending] = useState(false);

  const update = (field: keyof typeof EMPTY_FORM, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors({});
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: typeof errors = {};
    if (form.subject.trim().length < 3) nextErrors.subject = "Give it a short subject, like \"Can't upload a photo\".";
    if (form.message.trim().length < 2) nextErrors.message = "Tell us what's going on.";
    if (Object.keys(nextErrors).length) return setErrors(nextErrors);

    setSending(true);
    try {
      const response = await openTicket({ subject: form.subject.trim(), category: form.category, message: form.message.trim(), workspaceId: activeWorkspace?.id });
      setForm(EMPTY_FORM);
      onOpened(response.data.data.ticket);
    } catch (error) {
      setErrors({ form: failureMessage(error, "Your message didn't send. Try again in a moment.") });
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      {!compact && (
        <SelectField label="Topic" value={form.category} onChange={(event) => update("category", event.target.value)}>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
      )}
      <TextField label="Subject" value={form.subject} maxLength={150} onChange={(event) => update("subject", event.target.value)} error={errors.subject} />
      <TextAreaField
        label="Message"
        rows={compact ? 3 : 6}
        maxLength={5000}
        value={form.message}
        onChange={(event) => update("message", event.target.value)}
        error={errors.message}
        hint={compact ? undefined : "What happened, what you expected, and the steps to see it. Screenshots aren't supported yet, so describe what you see."}
      />
      {errors.form && <p className="text-[14px] text-brick">{errors.form}</p>}
      <div>
        <Button type="submit" loading={sending} icon={<Send size={16} aria-hidden="true" />}>
          Send to support
        </Button>
      </div>
    </form>
  );
}
