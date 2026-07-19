// EmptyState reassures users when there are no tasks yet or no results match a filter.
import Button from "./Button";

export default function EmptyState({ onAddTask, filtered }) {
  return (
    <div className="flex flex-col items-center text-center py-20 px-6">
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
        style={{ background: "var(--moss-light)" }}
      >
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path
            d="M4 11l5 5L18 6"
            stroke="var(--moss-dark)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h3 className="font-display text-xl mb-1.5" style={{ color: "var(--ink)" }}>
        {filtered ? "No matches yet" : "Ready when you are"}
      </h3>
      <p className="text-sm mb-6 max-w-xs" style={{ color: "var(--ink-soft)" }}>
        {filtered
          ? "Try another filter or clear your search."
          : "Add one task and let Afritask carry the rest."}
      </p>
      {!filtered && <Button onClick={onAddTask}>Add your first task</Button>}
    </div>
  );
}
