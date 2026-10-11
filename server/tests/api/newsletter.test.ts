// API: the newsletter — subscribing (signup, settings, website), opting out (settings toggle,
// one-click link), publishing from the admin console, and sending to subscribers only.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { runNewsletterSweep } from "../../src/services/newsletterService.js";
import { anonymous, createClient } from "../helpers/client.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createSignedInUser, createUser, uniqueEmail } from "../helpers/factories.js";
import { VERIFY_LINK, clearMailbox, emailsTo, lastEmailTo, tokenFromEmail } from "../helpers/mailbox.js";
import { createOperatorClient } from "../helpers/operator.js";

beforeEach(async () => {
    await resetDatabase();
    clearMailbox();
});
afterAll(disconnectDatabase);

const CONFIRM_LINK = /\/newsletter\/confirm\?subscriber=([^&\s]+)&expires=(\d+)&signature=([^&\s]+)/;
const UNSUBSCRIBE_LINK = /\/newsletter\/unsubscribe\?subscriber=([^&\s]+)&signature=([^&\s]+)/;

const subscriberStatus = async (email: string) => (await prisma.newsletterSubscriber.findUnique({ where: { email } }))?.status ?? null;

// A published post that was asked to be emailed, via the real admin endpoints.
const publishPost = async (emailSubscribers = true) => {
    const { client: operator } = await createOperatorClient();
    const created = await operator.post("/newsletter/posts", { title: "October update", summary: "Start dates are here.", body: "Plan work ahead.\n\nYou'll get a reminder the day before." });
    expect(created.status).toBe(201);
    const postId: string = created.body.data.post.id;
    await expect(operator.post(`/newsletter/posts/${postId}/publish`, { emailSubscribers })).resolves.toMatchObject({ status: 200 });
    return { operator, postId };
};

describe("account holders", () => {
    it("signup opt-in starts once the email is verified", async () => {
        const email = uniqueEmail("signup");
        await createClient().post("/auth/signup", { name: "Ada", email, password: "analytical-engine", acceptTerms: true, newsletter: true });
        expect(await subscriberStatus(email)).toBe("pending");

        await anonymous().get(`/api/v1/auth/verify-email/${tokenFromEmail(email, VERIFY_LINK)}`);
        expect(await subscriberStatus(email)).toBe("subscribed");
    });

    it("signup without the box creates no subscription", async () => {
        const email = uniqueEmail("signup");
        await createClient().post("/auth/signup", { name: "Ada", email, password: "analytical-engine", acceptTerms: true });
        expect(await subscriberStatus(email)).toBeNull();
    });

    it("the settings toggle turns it on and off", async () => {
        const { user, client } = await createSignedInUser();
        await expect(client.get("/newsletter/subscription")).resolves.toMatchObject({ body: { data: { subscribed: false } } });

        await expect(client.put("/newsletter/subscription", { subscribed: true })).resolves.toMatchObject({ status: 200, body: { data: { subscribed: true } } });
        expect(await subscriberStatus(user.email)).toBe("subscribed");
        await expect(client.get("/newsletter/subscription")).resolves.toMatchObject({ body: { data: { subscribed: true } } });

        await expect(client.put("/newsletter/subscription", { subscribed: false })).resolves.toMatchObject({ status: 200 });
        expect(await subscriberStatus(user.email)).toBe("unsubscribed");
        await expect(client.put("/newsletter/subscription", { subscribed: "yes" })).resolves.toMatchObject({ status: 400 });
    });

    it("the toggle adopts an earlier website sign-up with the same address", async () => {
        const { user, client } = await createSignedInUser();
        await createClient().post("/newsletter/subscribe", { email: user.email });
        const websiteRow = await prisma.newsletterSubscriber.findUniqueOrThrow({ where: { email: user.email } });

        await client.put("/newsletter/subscription", { subscribed: true });
        await expect(prisma.newsletterSubscriber.findUniqueOrThrow({ where: { id: websiteRow.id } })).resolves.toMatchObject({ userId: user.id, status: "subscribed" });
        expect(await prisma.newsletterSubscriber.count()).toBe(1);
    });
});

describe("visitors (website form)", () => {
    it("double opt-in: subscribing emails a confirmation link, which subscribes them", async () => {
        const email = uniqueEmail("visitor");
        const response = await createClient().post("/newsletter/subscribe", { email });
        expect(response.status).toBe(200);
        expect(await subscriberStatus(email)).toBe("pending");

        const [, subscriber, expires, signature] = lastEmailTo(email).text.match(CONFIRM_LINK)!;
        await expect(createClient().post("/newsletter/confirm", { subscriber, expires, signature: "forged" })).resolves.toMatchObject({ status: 400 });
        await expect(createClient().post("/newsletter/confirm", { subscriber, expires, signature })).resolves.toMatchObject({ status: 200 });
        expect(await subscriberStatus(email)).toBe("subscribed");
    });

    it("answers the same for an address that's already subscribed, without emailing it", async () => {
        const email = uniqueEmail("visitor");
        await prisma.newsletterSubscriber.create({ data: { email, source: "website", status: "subscribed", confirmedAt: new Date() } });
        const response = await createClient().post("/newsletter/subscribe", { email });
        expect(response.status).toBe(200);
        expect(emailsTo(email)).toHaveLength(0);
    });

    it("rejects a malformed address", async () => {
        await expect(createClient().post("/newsletter/subscribe", { email: { not: "" } })).resolves.toMatchObject({ status: 400 });
    });
});

describe("publishing and sending", () => {
    it("drafts stay out of the public feed; published posts appear", async () => {
        const { client: operator } = await createOperatorClient();
        const draft = await operator.post("/newsletter/posts", { title: "Secret draft", body: "Not yet." });
        await expect(anonymous().get("/api/v1/newsletter/posts")).resolves.toMatchObject({ body: { data: { items: [] } } });
        await expect(anonymous().get(`/api/v1/newsletter/posts/${draft.body.data.post.id}`)).resolves.toMatchObject({ status: 404 });

        const { postId } = await publishPost(false);
        const feed = await anonymous().get("/api/v1/newsletter/posts");
        expect(feed.body.data.items.map((post: { id: string }) => post.id)).toEqual([postId]);
        expect(feed.body.data.items[0]).not.toHaveProperty("emailRequested");
    });

    it("emails subscribers only, once, each with how to opt out", async () => {
        const subscribed = await createUser();
        const unsubscribed = await createUser();
        const pending = uniqueEmail("pending");
        await prisma.newsletterSubscriber.createMany({
            data: [
                { email: subscribed.email, userId: subscribed.id, source: "profile", status: "subscribed", confirmedAt: new Date() },
                { email: unsubscribed.email, userId: unsubscribed.id, source: "profile", status: "unsubscribed" },
                { email: pending, source: "website", status: "pending" },
            ],
        });
        const { operator, postId } = await publishPost(true);

        await expect(runNewsletterSweep()).resolves.toBe(1);
        await expect(runNewsletterSweep()).resolves.toBe(0);

        expect(emailsTo(subscribed.email)).toHaveLength(1);
        expect(emailsTo(unsubscribed.email)).toHaveLength(0);
        expect(emailsTo(pending)).toHaveLength(0);

        const email = lastEmailTo(subscribed.email);
        expect(email.subject).toBe("October update");
        expect(email.text).toMatch(UNSUBSCRIBE_LINK);
        expect(email.text).toContain("Settings → Profile");
        expect(email.html).toContain("Unsubscribe");
        // RFC 8058 one-click unsubscribe, which Gmail and Yahoo require of bulk senders.
        expect(email.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
        expect(email.headers?.["List-Unsubscribe"]).toMatch(/\/api\/v1\/newsletter\/unsubscribe\?/);

        const post = await operator.get(`/newsletter/posts/${postId}`);
        expect(post.body.data.post).toMatchObject({ _count: { deliveries: 1 } });
        expect(post.body.data.post.emailCompletedAt).not.toBeNull();
    });

    it("the one-click link unsubscribes without the CSRF header (mail apps POST it as-is)", async () => {
        const user = await createUser();
        await prisma.newsletterSubscriber.create({ data: { email: user.email, userId: user.id, source: "profile", status: "subscribed", confirmedAt: new Date() } });
        await publishPost(true);
        await runNewsletterSweep();
        const [, subscriber, signature] = lastEmailTo(user.email).text.match(UNSUBSCRIBE_LINK)!;

        await expect(anonymous().post(`/api/v1/newsletter/unsubscribe?subscriber=${subscriber}&signature=forged`)).resolves.toMatchObject({ status: 400 });
        const response = await anonymous()
            .post(`/api/v1/newsletter/unsubscribe?subscriber=${subscriber}&signature=${signature}`)
            .type("form")
            .send("List-Unsubscribe=One-Click");
        expect(response.status).toBe(200);
        expect(await subscriberStatus(user.email)).toBe("unsubscribed");
    });

    it("can't publish twice or delete a published post; drafts can be deleted", async () => {
        const { operator, postId } = await publishPost(false);
        await expect(operator.post(`/newsletter/posts/${postId}/publish`, { emailSubscribers: true })).resolves.toMatchObject({ status: 409 });
        await expect(operator.delete(`/newsletter/posts/${postId}`)).resolves.toMatchObject({ status: 409 });

        const draft = await operator.post("/newsletter/posts", { title: "Scrap", body: "x" });
        await expect(operator.delete(`/newsletter/posts/${draft.body.data.post.id}`)).resolves.toMatchObject({ status: 204 });
        // Drafted, published, drafted, deleted — the refused publish and delete wrote nothing.
        expect(await prisma.adminAuditEntry.count({ where: { action: { startsWith: "newsletter." } } })).toBe(4);
    });

    it("customers can't reach the admin endpoints", async () => {
        const { client } = await createSignedInUser();
        await expect(client.post("/admin/newsletter/posts", { title: "x", body: "y" })).resolves.toMatchObject({ status: 401 });
    });
});
