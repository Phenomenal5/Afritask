// API: support tickets — customers write to "Afritask support", support replies from the
// admin console. Customers only see their own tickets, and never who replied.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createSignedInUser, createTeam } from "../helpers/factories.js";
import { clearMailbox, emailsTo } from "../helpers/mailbox.js";
import { createOperatorClient } from "../helpers/operator.js";

beforeEach(async () => {
    await resetDatabase();
    clearMailbox();
});
afterAll(disconnectDatabase);

const openTicket = async (client: Awaited<ReturnType<typeof createSignedInUser>>["client"], overrides: Record<string, unknown> = {}) => {
    const response = await client.post("/support/tickets", { subject: "Can't upload my photo", category: "problem", message: "The upload button does nothing on my phone.", ...overrides });
    expect(response.status).toBe(201);
    return response.body.data.ticket;
};

describe("customers", () => {
    it("open a ticket with a reference number and see it in their list", async () => {
        const { client } = await createSignedInUser();
        const ticket = await openTicket(client);
        expect(ticket).toMatchObject({ subject: "Can't upload my photo", category: "problem", status: "open" });
        expect(ticket.number).toBeGreaterThanOrEqual(1001);
        expect(ticket.messages).toEqual([expect.objectContaining({ body: "The upload button does nothing on my phone.", fromSupport: false })]);

        const list = await client.get("/support/tickets");
        expect(list.body.data.tickets.map((item: { id: string }) => item.id)).toEqual([ticket.id]);
    });

    it("only ever see their own tickets", async () => {
        const owner = await createSignedInUser();
        const someoneElse = await createSignedInUser();
        const ticket = await openTicket(owner.client);

        await expect(someoneElse.client.get(`/support/tickets/${ticket.id}`)).resolves.toMatchObject({ status: 404 });
        await expect(someoneElse.client.post(`/support/tickets/${ticket.id}/messages`, { body: "hi" })).resolves.toMatchObject({ status: 404 });
        await expect(someoneElse.client.get("/support/tickets")).resolves.toMatchObject({ body: { data: { tickets: [] } } });
    });

    it("keep the workspace for context only when they're really in it", async () => {
        const team = await createTeam();
        const mine = await openTicket(team.member.client, { workspaceId: team.workspace.id });
        const notMine = await openTicket(team.outsider.client, { workspaceId: team.workspace.id });
        await expect(prisma.supportTicket.findUniqueOrThrow({ where: { id: mine.id } })).resolves.toMatchObject({ workspaceId: team.workspace.id });
        await expect(prisma.supportTicket.findUniqueOrThrow({ where: { id: notMine.id } })).resolves.toMatchObject({ workspaceId: null });
    });

    it("get clear errors for bad input", async () => {
        const { client } = await createSignedInUser();
        await expect(client.post("/support/tickets", { subject: "", message: "x long enough" })).resolves.toMatchObject({ status: 400 });
        await expect(client.post("/support/tickets", { subject: "Help", message: "" })).resolves.toMatchObject({ status: 400 });
        await expect(client.post("/support/tickets", { subject: "Help", message: "Please", category: "urgent!!" })).resolves.toMatchObject({ status: 400 });
    });
});

describe("support replies", () => {
    it("reach the customer as 'Afritask support': in the thread, as a notification and by email", async () => {
        const { user, client } = await createSignedInUser();
        const ticket = await openTicket(client);
        const { client: operator, user: operatorUser } = await createOperatorClient();

        const queue = await operator.get("/support/tickets");
        expect(queue.body.data.items).toEqual([expect.objectContaining({ id: ticket.id, requester: expect.objectContaining({ email: user.email }) })]);

        const replied = await operator.post(`/support/tickets/${ticket.id}/messages`, { body: "Thanks! Try clearing the app's cache, then upload again." });
        expect(replied.status).toBe(201);
        expect(replied.body.data.ticket.status).toBe("waiting_on_customer");

        // The customer sees the reply, but not who wrote it.
        const thread = await client.get(`/support/tickets/${ticket.id}`);
        const reply = thread.body.data.ticket.messages[1];
        expect(reply).toEqual({ id: expect.any(String), body: "Thanks! Try clearing the app's cache, then upload again.", fromSupport: true, createdAt: expect.any(String) });
        expect(JSON.stringify(thread.body)).not.toContain(operatorUser.email);
        expect(JSON.stringify(thread.body)).not.toContain(operatorUser.id);

        const notifications = await client.get("/notifications");
        expect(notifications.body.data.notifications[0]).toMatchObject({ type: "support_reply", supportTicketId: ticket.id, actor: null, available: true });

        const [email] = emailsTo(user.email);
        expect(email!.subject).toBe(`Re: Can't upload my photo [#${ticket.number}]`);
        expect(email!.text).toContain("Try clearing the app's cache");

        await expect(prisma.adminAuditEntry.count({ where: { action: "support.replied", targetId: ticket.id } })).resolves.toBe(1);
    });

    it("follow the ticket through its statuses", async () => {
        const { client } = await createSignedInUser();
        const ticket = await openTicket(client);
        const { client: operator } = await createOperatorClient();

        await operator.post(`/support/tickets/${ticket.id}/messages`, { body: "Fixed on our side." });
        // The customer writing back puts it back in the queue.
        await expect(client.post(`/support/tickets/${ticket.id}/messages`, { body: "Still broken." })).resolves.toMatchObject({ body: { data: { ticket: { status: "open" } } } });
        await expect(client.post(`/support/tickets/${ticket.id}/resolve`)).resolves.toMatchObject({ body: { data: { ticket: { status: "resolved" } } } });

        await expect(operator.patch(`/support/tickets/${ticket.id}`, { status: "closed" })).resolves.toMatchObject({ status: 200 });
        await expect(client.post(`/support/tickets/${ticket.id}/messages`, { body: "One more thing" })).resolves.toMatchObject({ status: 409 });
        await expect(operator.post(`/support/tickets/${ticket.id}/messages`, { body: "Late reply" })).resolves.toMatchObject({ status: 409 });
    });

    it("are searchable by reference number", async () => {
        const { client } = await createSignedInUser();
        const ticket = await openTicket(client);
        await openTicket(client, { subject: "Another question" });
        const { client: operator } = await createOperatorClient();
        const found = await operator.get(`/support/tickets?q=%23${ticket.number}`);
        expect(found.body.data.items.map((item: { id: string }) => item.id)).toEqual([ticket.id]);
        await expect(operator.get("/support/summary")).resolves.toMatchObject({ body: { data: { summary: { open: 2 } } } });
    });

    it("customers can't use the support desk endpoints", async () => {
        const { client } = await createSignedInUser();
        await expect(client.get("/admin/support/tickets")).resolves.toMatchObject({ status: 401 });
    });
});
