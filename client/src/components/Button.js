// Button provides the shared Afritask button styles and loading affordance.
export default function Button({
  children,
  type = "button",
  onClick,
  variant = "primary",
  loading = false,
  disabled = false,
  full = false,
  size = "md",
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed";

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-5 py-3 text-base",
  };

  const variants = {
    primary: {
      background: "var(--moss)",
      color: "var(--paper)",
    },
    secondary: {
      background: "transparent",
      color: "var(--ink)",
      border: "1px solid var(--line)",
    },
    ghost: {
      background: "transparent",
      color: "var(--ink-soft)",
    },
    danger: {
      background: "transparent",
      color: "var(--error)",
      border: "1px solid var(--error-tint)",
    },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${sizes[size]} ${full ? "w-full" : ""} cursor-pointer hover:opacity-90 active:scale-[0.98]`}
      style={variants[variant]}
    >
      {loading && (
        <span
          className="w-3.5 h-3.5 rounded-full border-2 animate-spin"
          style={{
            borderColor: "currentColor",
            borderTopColor: "transparent",
            opacity: 0.8,
          }}
        />
      )}
      {children}
    </button>
  );
}
