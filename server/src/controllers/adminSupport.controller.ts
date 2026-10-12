import validator from "validator";
import prisma from "../config/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger, { errorMessage } from "../utils/logger.js";
import routeParam from "../utils/routeParam.js";
import { sendSupportReplyEmail } from "../utils/email.js";
import { requireOperatorContext } from "../middlewares/operatorAuth.middleware.js";
import { recordAdminAudit, requestIp } from "../services/adminAuditService.js";
import { dispatchNotificationsSoon } from "../services/realtimeService.js";
import { notifySupportReply, parseMessageBody, parseStatus, TICKET_STATUSES } from "../services/supportService.js";
import { pageOf, parsePaging } from "./adminDirectory.controller.js";

// ─── Support tickets: the admin console's side ─────────────────────
// Operators see the ticket, who wrote it (name and email) and which workspace they were
// in. Replies go out as "Afritask support". Every reply and status change is audited.

const ticketListSelect = {
    id: true,
    number: true,
    subject: true,
    category: true,
    status: true,
    lastMessageAt: true,
    createdAt: true,
    // requester is null for a visitor's message from the Contact page; contactName and
    // contactEmail say who wrote instead.
    requester: { select: { id: true, name: true, email: true } },
    contactName: true,
    contactEmail: true,
    workspace: { select: { id: true, name: true } },
    _count: { select: { messages: true } },
} as const satisfies Prisma.SupportTicketSelect;

const ticketDetailSelect = {
    ...ticketListSelect,
    resolvedAt: true,
    messages: {
        select: { id: true, body: true, fromSupport: true, createdAt: true, author: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
    },
} as const satisfies Prisma.SupportTicketSelect;

const requireTicketId = (ticketId: string | undefined) => {
    if (!ticketId || !validator.isUUID(ticketId)) throw new AppError("We couldn't find that request. Refresh to see the latest.", 404);
    return ticketId;
};

const loadTicket = async (ticketId: string) => {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: ticketDetailSelect });
    if (!ticket) throw new AppError("We couldn't find that request. Refresh to see the latest.", 404);
    return ticket;
};

// GET /api/v1/admin/support/tickets?status=&q=&page=&limit=
// Default: everything that still needs attention (open first, oldest activity first).
export const listTickets = catchAsync(async (req, res) => {
    const paging = parsePaging(req.query);
    const statusFilter = typeof req.query.status === "string" && req.query.status ? parseStatus(req.query.status) : null;
    const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 200) : "";
    // Up to 9 digits: a longer number can't be a ticket and overflows the column (a 500).
    const ticketNumber = /^#?\d{1,9}$/.test(search) ? Number(search.replace("#", "")) : null;

    const where: Prisma.SupportTicketWhereInput = {
        ...(statusFilter ? { status: statusFilter } : { status: { in: ["open", "waiting_on_customer"] } }),
        ...(search && {
            OR: [
                ...(ticketNumber ? [{ number: ticketNumber }] : []),
                { subject: { contains: search, mode: "insensitive" as const } },
                { requester: { email: { contains: search, mode: "insensitive" as const } } },
                { requester: { name: { contains: search, mode: "insensitive" as const } } },
                { contactEmail: { contains: search, mode: "insensitive" as const } },
                { contactName: { contains: search, mode: "insensitive" as const } },
            ],
        }),
    };
    const [tickets, total] = await prisma.$transaction([
        prisma.supportTicket.findMany({ where, select: ticketListSelect, orderBy: [{ status: "asc" }, { lastMessageAt: "asc" }], skip: paging.skip, take: paging.limit }),
        prisma.supportTicket.count({ where }),
    ]);
    res.status(200).json({ status: "success", data: pageOf(tickets, total, paging) });
});

// GET /api/v1/admin/support/summary — counts by status (the console overview).
export const getSupportSummary = catchAsync(async (_req, res) => {
    const groups = await prisma.supportTicket.groupBy({ by: ["status"], _count: { _all: true } });
    const summary = Object.fromEntries(TICKET_STATUSES.map((status) => [status, groups.find((group) => group.status === status)?._count._all ?? 0]));
    res.status(200).json({ status: "success", data: { summary } });
});

// GET /api/v1/admin/support/tickets/:ticketId
export const getTicket = catchAsync(async (req, res) => {
    const ticket = await loadTicket(requireTicketId(routeParam(req, "ticketId")));
    res.status(200).json({ status: "success", data: { ticket } });
});

// POST /api/v1/admin/support/tickets/:ticketId/messages  { body, status? }
// A reply notifies the customer in the app and by email. Status defaults to
// "waiting_on_customer"; send "resolved" to answer and close the loop in one go.
export const replyToTicket = catchAsync(async (req, res) => {
    const { operator } = requireOperatorContext(req);
    const ticketId = requireTicketId(routeParam(req, "ticketId"));
    const body = parseMessageBody(req.body?.body);
    const nextStatus = req.body?.status === undefined ? "waiting_on_customer" : parseStatus(req.body.status);

    const existing = await prisma.supportTicket.findUnique({ where: { id: ticketId }, include: { requester: { select: { email: true, name: true } } } });
    if (!existing) throw new AppError("We couldn't find that request. Refresh to see the latest.", 404);
    if (existing.status === "closed") throw new AppError("This ticket is closed. Reopen it first if you need to reply.", 409);

    await prisma.$transaction(async (transaction) => {
        const message = await transaction.supportMessage.create({ data: { ticketId, authorId: operator.userId, fromSupport: true, body } });
        await transaction.supportTicket.update({
            where: { id: ticketId },
            data: { status: nextStatus, lastMessageAt: new Date(), resolvedAt: nextStatus === "resolved" ? new Date() : null },
        });
        // A visitor has no account to notify: the email below is how they hear back.
        if (existing.requesterId) await notifySupportReply(transaction, { ...existing, requesterId: existing.requesterId }, message.id);
        await recordAdminAudit(transaction, {
            actorId: operator.userId,
            action: "support.replied",
            targetType: "support_ticket",
            targetId: ticketId,
            metadata: { ticketNumber: existing.number, status: nextStatus },
            ipAddress: requestIp(req),
        });
    });
    dispatchNotificationsSoon();

    // The email is a courtesy: the reply is already saved and in the customer's app.
    const replyTo = existing.requester?.email ?? existing.contactEmail;
    if (replyTo) sendSupportReplyEmail(replyTo, { ticketId, number: existing.number, subject: existing.subject, reply: body, fromVisitor: !existing.requesterId }).catch((error) =>
        logger.error(`Support reply email for ticket #${existing.number} failed: ${errorMessage(error)}`)
    );
    res.status(201).json({ status: "success", data: { ticket: await loadTicket(ticketId) } });
});

// PATCH /api/v1/admin/support/tickets/:ticketId  { status }
export const updateTicketStatus = catchAsync(async (req, res) => {
    const { operator } = requireOperatorContext(req);
    const ticketId = requireTicketId(routeParam(req, "ticketId"));
    const status = parseStatus(req.body?.status);

    await prisma.$transaction(async (transaction) => {
        const { count } = await transaction.supportTicket.updateMany({
            where: { id: ticketId },
            data: { status, resolvedAt: status === "resolved" ? new Date() : null },
        });
        if (count === 0) throw new AppError("We couldn't find that request. Refresh to see the latest.", 404);
        await recordAdminAudit(transaction, {
            actorId: operator.userId,
            action: "support.status_changed",
            targetType: "support_ticket",
            targetId: ticketId,
            metadata: { status },
            ipAddress: requestIp(req),
        });
    });
    res.status(200).json({ status: "success", data: { ticket: await loadTicket(ticketId) } });
});
