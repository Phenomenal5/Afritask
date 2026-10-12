// Mirrors server/src/utils/taskPermissions.ts (PRD §8) so the UI can explain what you
// can do BEFORE you try. NOTE: this only decides what to show — the server re-checks
// every write, and a 403 is still handled wherever these are used.
import type { Member, Task, WorkspaceRole } from "@/types/models";

export interface Viewer {
  userId: string | null;
  role: WorkspaceRole | null;
  membership: Member | null;
}

const isManager = (viewer: Viewer) => viewer.role === "owner" || viewer.role === "admin";
const isCreator = (viewer: Viewer, task: Task) => !!viewer.userId && task.creatorId === viewer.userId;
// "Assigned" means CURRENTLY assigned — reassigning a task away removes this right.
const isAssignee = (viewer: Viewer, task: Task) => !!viewer.membership && task.assigneeMembershipId === viewer.membership.id;
// A subtask is also controlled by whoever is assigned its parent task.
const isParentAssignee = (viewer: Viewer, task: Task) => !!viewer.membership && !!task.parent && task.parent.assigneeMembershipId === viewer.membership.id;

const isArchived = (task: Task) => task.project?.state === "archived";

export const canEditTask = (viewer: Viewer, task: Task) =>
  !isArchived(task) && (isManager(viewer) || isCreator(viewer, task) || isAssignee(viewer, task) || isParentAssignee(viewer, task));

// Delete is "created only" for Members — being assigned is not enough.
export const canDeleteTask = (viewer: Viewer, task: Task) => !isArchived(task) && (isManager(viewer) || isCreator(viewer, task) || isParentAssignee(viewer, task));

// Why a control is unavailable, in words the person can act on.
export const editBlockedReason = (viewer: Viewer, task: Task): string | null => {
  if (isArchived(task)) return "This task's project is archived, so it's read-only until an Owner or Admin restores it.";
  if (canEditTask(viewer, task)) return null;
  return "Members can change tasks they created or are assigned to, and the subtasks of tasks assigned to them. Ask the assignee or an Admin.";
};
