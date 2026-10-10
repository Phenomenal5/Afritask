// Shapes of the API responses the UI reads. They mirror the server's JSON (see
// server/API_DOCUMENTATION.md) — only the fields the client uses are listed.

export type TaskStatus = "todo" | "in_progress" | "in_review" | "completed";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type WorkspaceRole = "owner" | "admin" | "member";
export type ProjectState = "active" | "on_hold" | "completed" | "archived";

export interface PublicUser {
  id: string;
  name: string;
  email?: string;
  photo?: string | null;
}

export interface CurrentUser extends PublicUser {
  email: string;
  timezone: string;
  age?: number | null;
  provider?: "local" | "google";
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  role: WorkspaceRole;
  memberCount?: number;
}

export interface Member {
  id: string;
  role: WorkspaceRole;
  joinedAt: string;
  user: PublicUser & { email: string };
}

export interface WorkspaceDetails extends WorkspaceSummary {
  members: Member[];
}

export interface Label {
  id: string;
  name: string;
  color: string;
  taskCount?: number;
}

export interface Task {
  id: string;
  workspaceId: string;
  creatorId: string;
  projectId: string | null;
  parentTaskId: string | null;
  assigneeMembershipId: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  dueKind: "date" | "datetime" | null;
  dueTimezone: string | null;
  completedAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  project: { id: string; name: string; state: ProjectState } | null;
  assignee: { id: string; user: PublicUser } | null;
  labels: Label[];
  parent: { id: string; title: string } | null;
  subtaskCounts: { total: number; completed: number };
  subtasks?: Task[];
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  state: ProjectState;
  priorState: ProjectState | null;
  updatedAt: string;
  taskCounts: { total: number; completed: number; open: number };
  canManage?: boolean;
}

export interface Invitation {
  id: string;
  email: string;
  role: WorkspaceRole;
  status: "pending" | "expired" | "accepted" | "declined" | "revoked";
  deliveryStatus: "pending" | "sent" | "failed";
  expiresAt: string;
  inviterName: string;
  workspaceName?: string;
}

export interface CommentMention {
  membershipId: string;
  userId: string;
  name: string;
}

export interface Comment {
  id: string;
  taskId: string;
  // Empty once deleted — the server never returns a deleted comment's text.
  body: string;
  author: PublicUser;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  deletedBy: { id: string; name: string } | null;
  mentions: CommentMention[];
  canEdit: boolean;
  canDelete: boolean;
}

export interface ActivityEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  projectId: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  summary: string;
  createdAt: string;
  actor: PublicUser;
}

export interface ActivityPage {
  entries: ActivityEntry[];
  nextCursor: string | null;
}

// Every context action resolves to this instead of throwing, so pages can react.
export interface ActionResult<Payload = undefined> {
  success: boolean;
  message?: string;
  conflict?: boolean;
  forbidden?: boolean;
  data?: Payload;
}

// The server-side filters GET /workspaces/:id/tasks understands. Search and due-date
// buckets have no server parameter, so they're applied in the browser.
export interface TaskServerQuery {
  projectId?: string;
  assignee?: "me" | "none" | string;
  includeSubtasks?: "true";
}
