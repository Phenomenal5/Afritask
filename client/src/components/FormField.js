// FormField keeps text inputs visually consistent across auth, profile, and task forms.
export default function FormField({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  required = false,
  name,
  autoComplete,
  rightElement,
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={name}
        className="text-sm font-medium"
        style={{ color: "var(--ink)" }}
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          className="w-full px-3.5 py-2.5 rounded-lg text-sm transition-colors outline-none"
          style={{
            background: "var(--paper-raised)",
            border: `1px solid ${error ? "var(--error)" : "var(--line)"}`,
            color: "var(--ink)",
          }}
        />
        {rightElement && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {rightElement}
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs" style={{ color: "var(--error)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
