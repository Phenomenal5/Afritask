// Turns server activity entries into readable sentences and before → after lines.
import { PRIORITY_STYLES, STATUS_LABELS } from "@/utils/taskMeta";
import { PROJECT_STATE_LABELS } from "@/utils/projects";
import { ROLE_LABELS } from "@/utils/roles";

// What the actor did. `subject` is the name stored with the entry (title at that time).
const ACTION_PHRASES = {
  "task.created": (subject) => `created the task “${subject}”`,
  "task.updated": (subject) => `updated “${subject}”`,
  "task.deleted": (subject) => `deleted the task “${subject}”`,
  "subtask.created": (subject) => `added the subtask “${subject}”`,
  "project.created": (subject) => `created the project “${subject}”`,
  "project.updated": (subject) => `updated the project “${subject}”`,
  "project.archived": (subject) => `archived the project “${subject}”`,
  "project.restored": (subject) => `restored the project “${subject}”`,
  "member.joined": () => "joined the workspace",
  "member.role_changed": (subject) => `changed ${subject}’s role`,
  "member.removed": (subject) => `removed ${subject} from the workspace`,
  "member.left": () => "left the workspace",
  "ownership.transferred": (subject) => `made ${subject} the Owner`,
  "workspace.created": (subject) => `created the workspace “${subject}”`,
  "workspace.renamed": () => "renamed the workspace",
};

export const describeAction = (entry) => (ACTION_PHRASES[entry.action] ?? (() => entry.action))(entry.summary);

const FIELD_LABELS = {
  title: "Title",
  name: "Name",
  description: "Description",
  status: "Status",
  priority: "Priority",
  dueAt: "Due",
  project: "Project",
  assignee: "Assignee",
  labels: "Labels",
  state: "State",
  role: "Role",
  owner: "Owner",
};

const formatValue = (field, value) => {
  if (value === null || value === undefined || value === "") return "none";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "none";
  if (field === "status") return STATUS_LABELS[value] ?? value;
  if (field === "priority") return PRIORITY_STYLES[value]?.label ?? value;
  if (field === "state") return PROJECT_STATE_LABELS[value] ?? value;
  if (field === "role") return ROLE_LABELS[value] ?? value;
  if (field === "dueAt") {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
  }
  return String(value);
};

// [{ field: "Status", from: "To do", to: "Completed" }, …]. Descriptions are long, so they
// only say "changed" rather than printing both versions.
export const describeChanges = (entry) =>
  Object.entries(entry.changes ?? {}).map(([field, change]) => ({
    field: FIELD_LABELS[field] ?? field,
    from: field === "description" ? null : formatValue(field, change.from),
    to: field === "description" ? "changed" : formatValue(field, change.to),
  }));

// "just now", "5 min ago", "3 h ago", then a date.
export const timeAgo = (instant, now = new Date()) => {
  const seconds = Math.round((now.getTime() - new Date(instant).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(instant));
};
