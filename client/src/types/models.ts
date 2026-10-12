// Shapes of the API responses the UI reads. They mirror the server's JSON (see
// server/API_DOCUMENTATION.md) — only the fields the client uses are listed.

export type TaskStatus = "todo" | "in_progress" | "in_review" | "completed";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type WorkspaceRole = "owner" | "admin" | "member";
export type ProjectState = "active" | "on_hold" | "completed" | "archived";
export type ReminderOffset = "at_due" | "one_hour" | "one_day" | "three_days" | "one_week";

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
  // "What was done" — set when completed (required for top-level tasks), null once reopened.
  completionNote: string | null;
  reminderOffset: ReminderOffset | null;
  // When work is planned to begin; a date-only start is 00:00 that day in startTimezone.
  startAt: string | null;
  startKind: "date" | "datetime" | null;
  startTimezone: string | null;
  startReminderAt: string | null;
  // When the pending reminder / overdue alert fires; null when nothing is pending.
  remindAt: string | null;
  overdueCheckAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  project: { id: string; name: string; state: ProjectState } | null;
  assignee: { id: string; user: PublicUser } | null;
  labels: Label[];
  // For a subtask: its task's title, time window and assignee (who also controls this subtask).
  parent: { id: string; title: string; startAt: string | null; dueAt: string | null; assigneeMembershipId: string | null } | null;
  subtaskCounts: { total: number; completed: number };
  // Comments that aren't deleted (the comment button on list rows and board cards).
  commentCount?: number;
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

export type NotificationType = "task_assigned" | "comment_mention" | "invitation_received" | "task_reminder" | "task_overdue" | "task_starting" | "support_reply";

export interface AppNotification {
  id: string;
  type: NotificationType;
  createdAt: string;
  readAt: string | null;
  actor: PublicUser | null;
  workspace: { id: string; name: string } | null;
  taskId: string | null;
  commentId: string | null;
  invitationId: string | null;
  // support_reply only: the ticket to open.
  supportTicketId: string | null;
  // Task title (or workspace name for invitations) when it happened. Empty once the
  // item can't be opened any more — the server withholds it.
  summary: string;
  available: boolean;
  unavailableReason: string | null;
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

export interface DashboardCounts {
  generatedAt: string;
  timezone: string;
  // Assigned to you, subtasks included (what My Tasks lists).
  personal: { dueToday: number; overdue: number; inProgress: number; completedThisWeek: number };
  // Top-level tasks, archived projects excluded.
  workspace: { open: number; completed: number; overdue: number; activeProjects: number };
  projects: { id: string; name: string; state: ProjectState; total: number; completed: number; open: number; percentComplete: number | null }[];
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
  // Server-side search (titles, descriptions, project names) — also finds subtasks.
  q?: string;
}

// A published newsletter post, as the public feed returns it. The body is plain text:
// blank lines separate paragraphs.
export interface NewsletterPost {
  id: string;
  title: string;
  summary: string;
  body: string;
  publishedAt: string;
}

// One page of a paged list (?page=&limit=).
export interface Page<Item> {
  items: Item[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

// ─── Monthly performance summary (counts only — see server performanceService) ─────────────────────
export interface MonthSummary {
  month: string;
  timezone: string;
  completed: number;
  completedOnTime: number;
  completedLate: number;
  completedWithoutDeadline: number;
  metWithoutExtending: number;
  onTimeAfterExtending: number;
  onTimeRate: number | null;
  extensions: number;
  planningDays: number;
  daysInMonth: number;
  tasksCreated: number;
  plannedAhead: number;
  plannedAheadRate: number | null;
  // Finished after the task's first deadline (extended or late).
  completedAfterOriginalDue: number;
  subtasksCompleted: number;
  projectsCreated: number;
  commentsWritten: number;
}

export interface TrendPoint {
  month: string;
  completedOnTime: number;
  completedLate: number;
  extensions: number;
  planningDays: number;
}

export interface PerformanceShare {
  id: string;
  month: string;
  createdAt: string;
  // Links made before links had a list of workspaces cover everything.
  allWorkspaces: boolean;
  showWorkspaceNames: boolean;
  workspaces: { id: string; name: string }[];
  // Only in the response that created it.
  token?: string;
}

// What a shared link covers, as the public page may show it.
export interface SharedScope {
  allWorkspaces: boolean;
  workspaceCount: number | null;
  // Only when the owner chose to show them.
  workspaceNames: string[] | null;
}

// One member's month in one workspace (team performance: Owners and Admins).
export interface TeamMemberPerformance {
  membershipId: string;
  role: WorkspaceRole;
  user: { id: string; name: string; photo: string | null };
  summary: MonthSummary;
}

// ─── Support tickets ─────────────────────
export type SupportTicketStatus = "open" | "waiting_on_customer" | "resolved" | "closed";
export type SupportTicketCategory = "question" | "problem" | "account" | "billing" | "feedback";

export interface SupportMessage {
  id: string;
  body: string;
  // Replies from support show as "Afritask support"; no name is ever given.
  fromSupport: boolean;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  number: number;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  lastMessageAt: string;
  createdAt: string;
  _count?: { messages: number };
  messages?: SupportMessage[];
}
