import type { NotificationType, Prisma } from "../generated/prisma/client.js";

// ─── In-app notifications (SRS SR10) ─────────────────────
// Every helper takes the caller's transaction client, so the notification commits (or
// rolls back) together with the change that caused it.
// Rules shared by all of them:
// - No notification to the actor for their own action.
// - Each logical notification has a deliveryKey; createMany(skipDuplicates) turns a
//   repeated event into a no-op instead of a duplicate.

interface NotificationDraft {
    recipientId: string;
    workspaceId: string | null;
    // Null for system notifications (reminders, overdue alerts).
    actorId: string | null;
    type: NotificationType;
    taskId?: string;
    commentId?: string;
    invitationId?: string;
    summary: string;
    deliveryKey: string;
}

const createNotifications = async (tx: Prisma.TransactionClient, drafts: NotificationDraft[]) => {
    const recipients = drafts.filter((draft) => draft.actorId === null || draft.recipientId !== draft.actorId);
    if (recipients.length === 0) return { count: 0 };
    // Suspended accounts receive nothing while suspended (SRS SR17).
    const suspended = await tx.user.findMany({
        where: { id: { in: recipients.map((draft) => draft.recipientId) }, suspendedAt: { not: null } },
        select: { id: true },
    });
    const suspendedIds = new Set(suspended.map((user) => user.id));
    const deliverable = recipients.filter((draft) => !suspendedIds.has(draft.recipientId));
    if (deliverable.length === 0) return { count: 0 };
    return tx.notification.createMany({ data: deliverable, skipDuplicates: true });
};

// ─── Assignment ─────────────────────
// Call after a write that may have changed a task's assignee. Notifies the NEW assignee
// only when it actually changed. The key includes the task version, so being assigned,
// unassigned and assigned again notifies each time — but one write never notifies twice.
export const notifyTaskAssigned = async (
    tx: Prisma.TransactionClient,
    task: { id: string; workspaceId: string; title: string; version: number; assigneeMembershipId: string | null },
    previousAssigneeMembershipId: string | null,
    actorId: string
) => {
    if (!task.assigneeMembershipId || task.assigneeMembershipId === previousAssigneeMembershipId) return;
    const assignee = await tx.membership.findFirst({
        where: { id: task.assigneeMembershipId, status: "active" },
        select: { userId: true },
    });
    if (!assignee) return;
    await createNotifications(tx, [
        {
            recipientId: assignee.userId,
            workspaceId: task.workspaceId,
            actorId,
            type: "task_assigned",
            taskId: task.id,
            summary: task.title,
            deliveryKey: `task_assigned:${task.id}:v${task.version}:${assignee.userId}`,
        },
    ]);
};

// ─── Mentions ─────────────────────
// `newlyMentionedMembershipIds`: on create, everyone mentioned; on edit, only people who
// weren't mentioned before (SRS SR08: unchanged mentions don't re-notify). `editEvent`
// identifies the create/edit so the same edit never notifies twice.
export const notifyMentions = async (
    tx: Prisma.TransactionClient,
    comment: { id: string; taskId: string; workspaceId: string },
    taskTitle: string,
    newlyMentionedMembershipIds: string[],
    actorId: string,
    editEvent: string
) => {
    if (newlyMentionedMembershipIds.length === 0) return;
    const mentioned = await tx.membership.findMany({
        where: { id: { in: newlyMentionedMembershipIds }, status: "active" },
        select: { userId: true },
    });
    await createNotifications(
        tx,
        mentioned.map(({ userId }) => ({
            recipientId: userId,
            workspaceId: comment.workspaceId,
            actorId,
            type: "comment_mention" as const,
            taskId: comment.taskId,
            commentId: comment.id,
            summary: taskTitle,
            deliveryKey: `comment_mention:${comment.id}:${editEvent}:${userId}`,
        }))
    );
};

// ─── Reminders and overdue alerts ─────────────────────
// Sent by the reminder sweep, not by a person. `scheduleKey` identifies the schedule that
// fired (the reminder/due instant), so re-running the sweep can't notify twice.
export const notifyTaskSchedule = (
    tx: Prisma.TransactionClient,
    kind: "task_reminder" | "task_overdue",
    task: { id: string; workspaceId: string; title: string },
    recipientId: string,
    scheduleKey: string
) =>
    createNotifications(tx, [
        {
            recipientId,
            workspaceId: task.workspaceId,
            actorId: null,
            type: kind,
            taskId: task.id,
            summary: task.title,
            deliveryKey: `${kind}:${task.id}:${scheduleKey}:${recipientId}`,
        },
    ]);

// ─── Invitations ─────────────────────
// Only when an account with that email already exists — otherwise the email is the only
// way to reach them. One notification per invitation; a resend doesn't add another.
export const notifyInvitation = async (
    tx: Prisma.TransactionClient,
    invitation: { id: string; email: string },
    workspaceName: string,
    actorId: string
) => {
    const invitee = await tx.user.findFirst({
        where: { email: { equals: invitation.email, mode: "insensitive" } },
        select: { id: true },
    });
    if (!invitee) return;
    await createNotifications(tx, [
        {
            recipientId: invitee.id,
            workspaceId: null,
            actorId,
            type: "invitation_received",
            invitationId: invitation.id,
            summary: workspaceName,
            deliveryKey: `invitation_received:${invitation.id}:${invitee.id}`,
        },
    ]);
};
