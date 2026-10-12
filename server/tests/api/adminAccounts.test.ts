// API: operators create and edit customer accounts from the admin console. An operator
// never sets or sees a password: a new account's owner gets a set-password link.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { createClient } from "../helpers/client.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createSignedInUser, createUser, uniqueEmail } from "../helpers/factories.js";
import { RESET_LINK, clearMailbox, emailsTo, lastEmailTo, tokenFromEmail } from "../helpers/mailbox.js";
import { createOperatorClient } from "../helpers/operator.js";

beforeEach(async () => {
    await resetDatabase();
    clearMailbox();
});
afterAll(disconnectDatabase);

const REASON = "Asked by phone to set them up";

describe("creating an account", () => {
    it("makes a passwordless account and emails its owner a set-password link they can use", async () => {
        const { client } = await createOperatorClient();
        const email = uniqueEmail("created");

        const response = await client.post("/accounts", { name: "  Ngozi   Created ", email: email.toUpperCase(), timezone: "Africa/Lagos", reason: REASON });
        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({ setupEmailSent: true, account: { name: "Ngozi Created", email, timezone: "Africa/Lagos", hasPassword: false } });

        const stored = await prisma.user.findUniqueOrThrow({ where: { email }, omit: { password: false } });
        expect(stored).toMatchObject({ password: null, isVerified: true, termsAcceptedAt: null });
        await expect(prisma.adminAuditEntry.count({ where: { action: "account.created", targetId: stored.id, reason: REASON } })).resolves.toBe(1);

        // Nobody can sign in until the owner chooses a password through the link.
        expect(lastEmailTo(email).subject).toBe("Your Afritask account is ready");
        const token = tokenFromEmail(email, RESET_LINK);
        await expect(createClient().patch(`/auth/reset-password/${token}`, { password: "chosen-by-owner" })).resolves.toMatchObject({ status: 200 });
        await expect(createClient().post("/auth/login", { email, password: "chosen-by-owner" })).resolves.toMatchObject({ status: 200 });
    });

    it("needs a reason and a free email, and is operator-only", async () => {
        const { client } = await createOperatorClient();
        const existing = await createUser();
        await expect(client.post("/accounts", { name: "No Reason", email: uniqueEmail() })).resolves.toMatchObject({ status: 400 });
        await expect(client.post("/accounts", { name: "Taken", email: existing.email.toUpperCase(), reason: REASON })).resolves.toMatchObject({ status: 409 });

        const customer = await createSignedInUser();
        await expect(customer.client.post("/admin/accounts", { name: "Sneaky", email: uniqueEmail(), reason: REASON })).resolves.toMatchObject({ status: 401 });
    });
});

describe("editing an account", () => {
    it("changes the name and time zone, and refuses an edit that changes nothing", async () => {
        const { client } = await createOperatorClient();
        const user = await createUser({ name: "Old Name" });

        const response = await client.patch(`/accounts/${user.id}`, { name: "New Name", timezone: "Europe/London", reason: REASON });
        expect(response.status).toBe(200);
        expect(response.body.data.account).toMatchObject({ name: "New Name", timezone: "Europe/London", hasPassword: true });
        await expect(client.patch(`/accounts/${user.id}`, { name: "New Name", reason: REASON })).resolves.toMatchObject({ status: 400 });
    });

    it("a new email signs them out everywhere and tells the old address", async () => {
        const { client } = await createOperatorClient();
        const { user, client: customer } = await createSignedInUser();
        const taken = await createUser();
        const newEmail = uniqueEmail("moved");

        await expect(client.patch(`/accounts/${user.id}`, { email: taken.email, reason: REASON })).resolves.toMatchObject({ status: 409 });

        const response = await client.patch(`/accounts/${user.id}`, { email: newEmail, reason: REASON });
        expect(response.status).toBe(200);
        expect(response.body.data.account.email).toBe(newEmail);
        await expect(customer.get("/auth/me")).resolves.toMatchObject({ status: 401 });

        // The notice is sent after the response; give it a moment.
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(emailsTo(user.email).map((email) => email.subject)).toContain("The email on your Afritask account was changed");
        const audit = await prisma.adminAuditEntry.findFirstOrThrow({ where: { action: "account.updated", targetId: user.id } });
        expect(audit.metadata).toMatchObject({ fields: ["email"], previousEmail: user.email, newEmail });
    });
});

describe("resending the set-password link", () => {
    it("emails a fresh link, but not to a suspended account", async () => {
        const { client } = await createOperatorClient();
        const user = await createUser();

        await expect(client.post(`/accounts/${user.id}/setup-link`)).resolves.toMatchObject({ status: 200 });
        expect(lastEmailTo(user.email).subject).toBe("Your Afritask account is ready");

        await prisma.user.update({ where: { id: user.id }, data: { suspendedAt: new Date(), suspendReason: "test" } });
        await expect(client.post(`/accounts/${user.id}/setup-link`)).resolves.toMatchObject({ status: 409 });
    });
});
