import prisma from "../config/prisma.js";
import AppError from "../utils/AppError.js";
import catchAsync from "../utils/catchAsync.js";
import logger from "../utils/logger.js";
import { assertValidEmail, normalizeEmail, normalizeName } from "../utils/userValidation.js";
import { parseCategory, parseMessageBody } from "../services/supportService.js";

// ─── Public Contact page ─────────────────────
// Anyone can write, signed in or not. The message becomes a support ticket with the
// visitor's name and email instead of an account, so it lands in the same queue as every
// other request, and support answers it by email.
// NOTE: nothing here links the ticket to an account with that email: the address isn't
// verified, so it proves nothing about who wrote.

const CONTACT_MESSAGE_MIN_LENGTH = 10;
const SUBJECT_PREVIEW_LENGTH = 80;

// "Can I invite people outside my company?" from the message's first line.
const subjectFrom = (message: string) => {
    const firstLine = message.split("\n")[0]!.replace(/\s+/g, " ").trim();
    return firstLine.length > SUBJECT_PREVIEW_LENGTH ? `${firstLine.slice(0, SUBJECT_PREVIEW_LENGTH).trimEnd()}...` : firstLine;
};

// POST /api/v1/contact  { name, email, topic?, message, website? }
export const sendContactMessage = catchAsync(async (req, res) => {
    // NOTE: `website` is a field people never see (hidden on the page). Bots fill in every
    // field; a filled one gets the same success answer and nothing is stored.
    if (typeof req.body.website === "string" && req.body.website.trim()) {
        logger.info("Contact form: dropped a submission that filled the hidden field");
        return res.status(201).json({ status: "success", data: { ticket: { number: null } } });
    }

    const contactName = normalizeName(req.body.name);
    const contactEmail = assertValidEmail(normalizeEmail(req.body.email));
    const category = parseCategory(req.body.topic);
    const body = parseMessageBody(req.body.message);
    if (body.length < CONTACT_MESSAGE_MIN_LENGTH) throw new AppError("Tell us a little more, so we can help.", 400);

    const ticket = await prisma.supportTicket.create({
        data: { contactName, contactEmail, subject: subjectFrom(body), category, messages: { create: { body } } },
        select: { number: true },
    });
    logger.info(`Support ticket #${ticket.number} opened from the Contact page`);
    res.status(201).json({ status: "success", data: { ticket } });
});
