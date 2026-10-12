// API: the public Contact page. A visitor's message becomes a support ticket with their
// name and email (no account), lands in the admin console's queue, and is answered by email.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { createClient } from "../helpers/client.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { clearMailbox, emailsTo } from "../helpers/mailbox.js";
import { createOperatorClient } from "../helpers/operator.js";

beforeEach(async () => {
    await resetDatabase();
    clearMailbox();
});
afterAll(disconnectDatabase);

const contactBody = (overrides: Record<string, unknown> = {}) => ({
    name: "Kemi Visitor",
    email: "  Kemi@Example.com ",
    topic: "question",
    message: "Can I invite people from outside my company?\nWe work with two agencies.",
    ...overrides,
});

describe("POST /contact", () => {
    it("anyone can write; it becomes a ticket with their name and email", async () => {
        const response = await createClient().post("/contact", contactBody());
        expect(response.status).toBe(201);
        expect(response.body.data.ticket.number).toBeGreaterThan(1000);

        const ticket = await prisma.supportTicket.findFirstOrThrow({ include: { messages: true } });
        expect(ticket).toMatchObject({
            requesterId: null,
            contactName: "Kemi Visitor",
            contactEmail: "kemi@example.com",
            category: "question",
            subject: "Can I invite people from outside my company?",
        });
        expect(ticket.messages).toHaveLength(1);
    });

    it("checks every field", async () => {
        const client = createClient();
        await expect(client.post("/contact", contactBody({ name: "" }))).resolves.toMatchObject({ status: 400 });
        await expect(client.post("/contact", contactBody({ email: "not-an-email" }))).resolves.toMatchObject({ status: 400 });
        await expect(client.post("/contact", contactBody({ topic: "lottery" }))).resolves.toMatchObject({ status: 400 });
        await expect(client.post("/contact", contactBody({ message: "hi" }))).resolves.toMatchObject({ status: 400 });
        await expect(client.post("/contact", contactBody({ message: "x".repeat(5001) }))).resolves.toMatchObject({ status: 400 });
        await expect(prisma.supportTicket.count()).resolves.toBe(0);
    });

    it("a bot that fills the hidden field gets the same answer, and nothing is stored", async () => {
        const response = await createClient().post("/contact", contactBody({ website: "https://spam.example" }));
        expect(response.status).toBe(201);
        await expect(prisma.supportTicket.count()).resolves.toBe(0);
    });
});

describe("answering a visitor from the admin console", () => {
    it("shows who wrote, finds them by email, and replies by email", async () => {
        await createClient().post("/contact", contactBody());
        const { client } = await createOperatorClient();

        const queue = await client.get("/support/tickets?q=kemi@example");
        expect(queue.body.data.items).toHaveLength(1);
        const [listed] = queue.body.data.items;
        expect(listed).toMatchObject({ requester: null, contactName: "Kemi Visitor", contactEmail: "kemi@example.com" });

        const reply = await client.post(`/support/tickets/${listed.id}/messages`, { body: "Yes. Invite them by email from Members." });
        expect(reply.status).toBe(201);
        // The email is sent after the response; give it a moment.
        await new Promise((resolve) => setTimeout(resolve, 50));
        const [email] = emailsTo("kemi@example.com");
        expect(email?.text).toMatch(/Invite them by email from Members/);
        expect(email?.text).toMatch(/\/contact/);
        // No account, so no in-app notification.
        await expect(prisma.notification.count()).resolves.toBe(0);
    });
});
