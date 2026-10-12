import type { Membership, Task } from "../generated/prisma/client.js";

// ─── Task permissions (SRS §2 / PRD §8 matrix) ─────────────────────
// Owner/Admin: everything in the workspace. Member: tasks they CREATED or are currently
// ASSIGNED to. Everyone in the workspace can view and create.
// NOTE (PRD §8 footnote 1): "assigned" means CURRENTLY assigned — once a non-creator
// reassigns a task to someone else, they lose edit permission on it.
// Subtasks: whoever is assigned the PARENT task also controls its subtasks (edit, dates,
// status, delete), whoever created or is assigned each one.

type TaskOwnershipFields = Pick<Task, "creatorId" | "assigneeMembershipId">;

const isManager = (membership: Membership) => membership.role === "owner" || membership.role === "admin";
const isCreator = (membership: Membership, task: TaskOwnershipFields) => task.creatorId === membership.userId;
const isAssignee = (membership: Membership, task: TaskOwnershipFields) => task.assigneeMembershipId === membership.id;

// parentAssigneeMembershipId: for a subtask, who is assigned its parent task.
const isParentAssignee = (membership: Membership, parentAssigneeMembershipId: string | null | undefined) =>
    !!parentAssigneeMembershipId && parentAssigneeMembershipId === membership.id;

export const canEditTask = (membership: Membership, task: TaskOwnershipFields, parentAssigneeMembershipId?: string | null) =>
    isManager(membership) || isCreator(membership, task) || isAssignee(membership, task) || isParentAssignee(membership, parentAssigneeMembershipId);

// Assign/reassign follows the same rule as editing (PRD §8: "Created or assigned").
export const canAssignTask = canEditTask;

// Delete is "created only" for Members — being assigned is not enough (PRD §8).
export const canDeleteTask = (membership: Membership, task: TaskOwnershipFields, parentAssigneeMembershipId?: string | null) =>
    isManager(membership) || isCreator(membership, task) || isParentAssignee(membership, parentAssigneeMembershipId);
