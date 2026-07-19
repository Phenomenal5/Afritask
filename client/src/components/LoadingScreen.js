// LoadingScreen gives the app a calm placeholder while auth or task data is resolving.
export default function LoadingScreen({ label = "Loading Afritask" }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 min-h-screen">
      <div className="relative w-8 h-8">
        <div
          className="absolute inset-0 rounded-full border-2 animate-spin"
          style={{
            borderColor: "var(--line)",
            borderTopColor: "var(--moss)",
          }}
        />
      </div>
      <p className="text-sm" style={{ color: "var(--ink-soft)" }}>
        {label}...
      </p>
    </div>
  );
}
