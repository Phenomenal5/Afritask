import type { Prisma, SupportTicketCategory, SupportTicketStatus } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";

// ─── Support tickets: shared rules ─────────────────────
// A customer writes to "Afritask support"; support replies from the admin console. The
// customer side never shows who replied: support messages carry no author for them.

export const TICKET_CATEGORIES: SupportTicketCategory[] = ["question", "problem", "account", "billing", "feedback"];
export const TICKET_STATUSES: SupportTicketStatus[] = ["open", "waiting_on_customer", "resolved", "closed"];

const SUBJECT_MIN_LENGTH = 3;
const SUBJECT_MAX_LENGTH = 150;
const MESSAGE_MIN_LENGTH = 2;
const MESSAGE_MAX_LENGTH = 5000;

export const parseSubject = (value: unknown) => {
    const subject = typeof value === "string" ? value.trim() : "";
    if (subject.length < SUBJECT_MIN_LENGTH) throw new AppError("Give your message a short subject.", 400);
    if (subject.length > SUBJECT_MAX_LENGTH) throw new AppError(`Keep the subject to ${SUBJECT_MAX_LENGTH} characters or fewer.`, 400);
    return subject;
};

export const parseMessageBody = (value: unknown) => {
    const body = typeof value === "string" ? value.trim() : "";
    if (body.length < MESSAGE_MIN_LENGTH) throw new AppError("Write a message first.", 400);
    if (body.length > MESSAGE_MAX_LENGTH) throw new AppError(`Keep the message to ${MESSAGE_MAX_LENGTH} characters or fewer.`, 400);
    return body;
};

export const parseCategory = (value: unknown): SupportTicketCategory => {
    if (value === undefined) return "question";
    if (typeof value !== "string" || !TICKET_CATEGORIES.includes(value as SupportTicketCategory)) throw new AppError("Choose a topic from the list.", 400);
    return value as SupportTicketCategory;
};

export const parseStatus = (value: unknown): SupportTicketStatus => {
    if (typeof value !== "string" || !TICKET_STATUSES.includes(value as SupportTicketStatus)) throw new AppError("Choose a status from the list.", 400);
    return value as SupportTicketStatus;
};

// What a customer sees of a message: support replies are just "Afritask support".
export const customerMessageSelect = { id: true, body: true, fromSupport: true, createdAt: true } as const satisfies Prisma.SupportMessageSelect;

// The in-app notification for a support reply. actorId stays null on purpose: the person
// who replied is never shown to the customer.
export const notifySupportReply = (
    transaction: Prisma.TransactionClient,
    ticket: { id: string; number: number; subject: string; requesterId: string },
    messageId: string
) =>
    transaction.notification.createMany({
        data: [
            {
                recipientId: ticket.requesterId,
                workspaceId: null,
                actorId: null,
                type: "support_reply",
                supportTicketId: ticket.id,
                summary: `#${ticket.number} ${ticket.subject}`,
                deliveryKey: `support_reply:${messageId}`,
            },
        ],
        skipDuplicates: true,
    });
