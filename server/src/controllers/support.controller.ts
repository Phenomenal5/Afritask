import validator from "validator";
import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger from "../utils/logger.js";
import routeParam from "../utils/routeParam.js";
import { requireUser } from "../middlewares/auth.middleware.js";
import { customerMessageSelect, parseCategory, parseMessageBody, parseSubject } from "../services/supportService.js";

// ─── Support tickets: the customer's side ─────────────────────
// Customers only ever see their own tickets. Replies from support show as "Afritask
// support" (no names, no ids).

const TICKET_LIST_LIMIT = 50;

const ticketSummarySelect = {
    id: true,
    number: true,
    subject: true,
    category: true,
    status: true,
    lastMessageAt: true,
    createdAt: true,
    _count: { select: { messages: true } },
} as const;

// 404 for anything that isn't theirs, so ticket ids can't be probed.
const loadOwnTicket = async (ticketId: string | undefined, userId: string) => {
    if (!ticketId || !validator.isUUID(ticketId)) throw new AppError("We couldn't find that request. Refresh to see the latest.", 404);
    const ticket = await prisma.supportTicket.findFirst({ where: { id: ticketId, requesterId: userId } });
    if (!ticket) throw new AppError("We couldn't find that request. Refresh to see the latest.", 404);
    return ticket;
};

const loadTicketWithMessages = (ticketId: string) =>
    prisma.supportTicket.findUniqueOrThrow({
        where: { id: ticketId },
        select: { ...ticketSummarySelect, messages: { select: customerMessageSelect, orderBy: { createdAt: "asc" } } },
    });

// POST /api/v1/support/tickets  { subject, category?, message, workspaceId? }
export const createTicket = catchAsync(async (req, res) => {
    const user = requireUser(req);
    const subject = parseSubject(req.body?.subject);
    const category = parseCategory(req.body?.category);
    const body = parseMessageBody(req.body?.message);

    // The workspace they were in is kept for context, but only if they're really in it.
    let workspaceId: string | null = null;
    if (typeof req.body?.workspaceId === "string" && validator.isUUID(req.body.workspaceId)) {
        const membership = await prisma.membership.findFirst({ where: { workspaceId: req.body.workspaceId, userId: user.id, status: "active" }, select: { workspaceId: true } });
        workspaceId = membership?.workspaceId ?? null;
    }

    const ticket = await prisma.supportTicket.create({
        data: { requesterId: user.id, workspaceId, subject, category, messages: { create: { authorId: user.id, body } } },
        select: { id: true, number: true },
    });
    logger.info(`Support ticket #${ticket.number} opened by user ${user.id}`);
    res.status(201).json({ status: "success", data: { ticket: await loadTicketWithMessages(ticket.id) } });
});

// GET /api/v1/support/tickets — mine, most recently active first.
export const listMyTickets = catchAsync(async (req, res) => {
    const tickets = await prisma.supportTicket.findMany({
        where: { requesterId: requireUser(req).id },
        select: ticketSummarySelect,
        orderBy: { lastMessageAt: "desc" },
        take: TICKET_LIST_LIMIT,
    });
    res.status(200).json({ status: "success", data: { tickets } });
});

// GET /api/v1/support/tickets/:ticketId
export const getMyTicket = catchAsync(async (req, res) => {
    const ticket = await loadOwnTicket(routeParam(req, "ticketId"), requireUser(req).id);
    res.status(200).json({ status: "success", data: { ticket: await loadTicketWithMessages(ticket.id) } });
});

// POST /api/v1/support/tickets/:ticketId/messages  { body }
// Replying reopens a resolved ticket; a closed one needs a new ticket.
export const replyToMyTicket = catchAsync(async (req, res) => {
    const user = requireUser(req);
    const ticket = await loadOwnTicket(routeParam(req, "ticketId"), user.id);
    if (ticket.status === "closed") throw new AppError("This ticket is closed. Start a new one and we'll pick it up from there.", 409);
    const body = parseMessageBody(req.body?.body);

    await prisma.$transaction([
        prisma.supportMessage.create({ data: { ticketId: ticket.id, authorId: user.id, body } }),
        prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: "open", lastMessageAt: new Date(), resolvedAt: null } }),
    ]);
    res.status(201).json({ status: "success", data: { ticket: await loadTicketWithMessages(ticket.id) } });
});

// POST /api/v1/support/tickets/:ticketId/resolve — "my question is answered".
export const resolveMyTicket = catchAsync(async (req, res) => {
    const ticket = await loadOwnTicket(routeParam(req, "ticketId"), requireUser(req).id);
    if (ticket.status !== "resolved" && ticket.status !== "closed") {
        await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: "resolved", resolvedAt: new Date() } });
    }
    res.status(200).json({ status: "success", data: { ticket: await loadTicketWithMessages(ticket.id) } });
});
