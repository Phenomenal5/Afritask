// ReminderSelect: the one reminder a task can have. Without a due date there's nothing to
// remind about, so the control is disabled and says why.
import { SelectField } from "@/components/ui/Field";
import { REMINDER_OPTIONS, reminderHint, type ReminderChoice } from "@/utils/reminders";

interface ReminderSelectProps {
  value: ReminderChoice;
  onChange: (choice: ReminderChoice) => void;
  hasDueDate: boolean;
  hasDueTime: boolean;
  disabled?: boolean;
}

export default function ReminderSelect({ value, onChange, hasDueDate, hasDueTime, disabled }: ReminderSelectProps) {
  return (
    <SelectField
      label="Reminder"
      value={hasDueDate ? value : "none"}
      onChange={(event) => onChange(event.target.value as ReminderChoice)}
      disabled={disabled || !hasDueDate}
      hint={hasDueDate ? reminderHint(value, hasDueTime) : "Set a due date to choose a reminder."}
    >
      {REMINDER_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </SelectField>
  );
}
