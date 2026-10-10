// A small rotating ring. Decorative — the surrounding control carries aria-busy or text.
export default function Spinner({ size = 18, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
