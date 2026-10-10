// Labelled form controls. Each one wires its hint and error to the input with
// aria-describedby, and marks it aria-invalid, so screen readers hear WHY a field failed.
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { CircleAlert } from "lucide-react";
import { cx } from "@/lib/cx";

interface FieldFrameProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  hideLabel?: boolean;
  children: ReactNode;
  className?: string;
}

function FieldFrame({ id, label, hint, error, optional, hideLabel, children, className }: FieldFrameProps) {
  return (
    <div className={cx("flex flex-col gap-1.5 min-w-0", className)}>
      <label htmlFor={id} className={cx("text-[14px] font-medium text-ink", hideLabel && "sr-only")}>
        {label}
        {optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-[13px] leading-snug text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-[13px] leading-snug text-brick">
          <CircleAlert aria-hidden="true" size={15} className="mt-px shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, hint?: ReactNode, error?: string | null) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;

type CommonProps = {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  optional?: boolean;
  hideLabel?: boolean;
  wrapperClassName?: string;
  trailing?: ReactNode;
};

export const TextField = forwardRef<HTMLInputElement, CommonProps & InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { label, hint, error, optional, hideLabel, wrapperClassName, trailing, id, className, ...rest },
  ref
) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error} optional={optional} hideLabel={hideLabel} className={wrapperClassName}>
      <div className="relative">
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
          className={cx("field-control", trailing ? "pr-20" : undefined, className)}
          {...rest}
        />
        {trailing && <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</div>}
      </div>
    </FieldFrame>
  );
});

export const TextAreaField = forwardRef<HTMLTextAreaElement, CommonProps & TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextAreaField(
  { label, hint, error, optional, hideLabel, wrapperClassName, id, className, ...rest },
  ref
) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error} optional={optional} hideLabel={hideLabel} className={wrapperClassName}>
      <textarea
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={cx("field-control resize-y leading-relaxed", className)}
        {...rest}
      />
    </FieldFrame>
  );
});

export const SelectField = forwardRef<HTMLSelectElement, CommonProps & SelectHTMLAttributes<HTMLSelectElement>>(function SelectField(
  { label, hint, error, optional, hideLabel, wrapperClassName, id, className, children, ...rest },
  ref
) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  return (
    <FieldFrame id={fieldId} label={label} hint={hint} error={error} optional={optional} hideLabel={hideLabel} className={wrapperClassName}>
      <select
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={cx("field-control", className)}
        {...rest}
      >
        {children}
      </select>
    </FieldFrame>
  );
});
