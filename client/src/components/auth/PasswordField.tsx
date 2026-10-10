"use client";

// Password input with a Show/Hide toggle that screen readers understand.
import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { TextField } from "@/components/ui/Field";

type PasswordFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
};

const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(function PasswordField(props, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      ref={ref}
      {...props}
      type={visible ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setVisible((shown) => !shown)}
          // A toggle: the label stays fixed and aria-pressed carries the state.
          aria-pressed={visible}
          aria-label="Show password"
          className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[8px] px-2.5 text-[13.5px] font-medium text-muted hover:bg-surface-muted hover:text-ink"
        >
          {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
          {visible ? "Hide" : "Show"}
        </button>
      }
    />
  );
});

export default PasswordField;
