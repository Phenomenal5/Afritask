import type { Membership, Task } from "../generated/prisma/client.js";

// ─── Task permissions (SRS §2 / PRD §8 matrix) ─────────────────────
// Owner/Admin: everything. Member: tasks they CREATED (assignee rule arrives with
// assignment in feat/tasks-v1). Everyone in the workspace can view and create.

type TaskOwnershipFields = Pick<Task, "creatorId">;

const isManager = (membership: Membership) => membership.role === "owner" || membership.role === "admin";

export const canEditTask = (membership: Membership, task: TaskOwnershipFields) =>
    isManager(membership) || task.creatorId === membership.userId;

// Delete is "created only" for Members — being assigned is not enough (PRD §8).
export const canDeleteTask = (membership: Membership, task: TaskOwnershipFields) =>
    isManager(membership) || task.creatorId === membership.userId;
