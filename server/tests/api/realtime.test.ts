// API: live notifications — sound/push preferences, push subscriptions, the dispatcher
// (SSE event + web push, exactly once), and the SSE stream itself.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { ACCESS_TOKEN_COOKIE } from "../../src/services/sessionService.js";
import { testPushOutbox } from "../../src/services/pushService.js";
import { dispatchPendingNotifications } from "../../src/services/realtimeService.js";
import { startServer } from "../helpers/browser.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createSignedInUser, createTask, createTeam } from "../helpers/factories.js";

beforeEach(async () => {
    await resetDatabase();
    testPushOutbox.sent.length = 0;
    testPushOutbox.goneEndpoints.clear();
});
afterAll(disconnectDatabase);

const subscriptionFor = (label: string) => ({
    endpoint: `https://fcm.googleapis.com/fcm/send/${label}`,
    keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
});

// Assign a task to the team member through the API, so the real notification is created.
const assignToMember = async (team: Awaited<ReturnType<typeof createTeam>>) => {
    const task = await createTask(team.workspace.id, team.owner.user.id, { title: "Ship the release" });
    const response = await team.owner.client.put(`/tasks/${task.id}`, { assigneeMembershipId: team.member.membership.id, version: task.version });
    expect(response.status).toBe(200);
    return task;
};

describe("preferences", () => {
    it("default to sound on, push off; validate and save", async () => {
        const { client } = await createSignedInUser();
        await expect(client.get("/notifications/preferences")).resolves.toMatchObject({
            status: 200,
            body: { data: { preferences: { soundEnabled: true, pushEnabled: false, pushAvailable: true } } },
        });

        await expect(client.put("/notifications/preferences", { pushEnabled: "yes" })).resolves.toMatchObject({ status: 400 });
        await expect(client.put("/notifications/preferences", {})).resolves.toMatchObject({ status: 400 });
        await expect(client.put("/notifications/preferences", { soundEnabled: false, pushEnabled: true })).resolves.toMatchObject({
            status: 200,
            body: { data: { preferences: { soundEnabled: false, pushEnabled: true } } },
        });
    });

    it("turning push off removes the account's push subscriptions", async () => {
        const { user, client } = await createSignedInUser();
        await client.put("/notifications/preferences", { pushEnabled: true });
        await client.post("/notifications/push/subscriptions", subscriptionFor("laptop"));
        await client.put("/notifications/preferences", { pushEnabled: false });
        expect(await prisma.pushSubscription.count({ where: { userId: user.id } })).toBe(0);
    });
});

describe("push subscriptions", () => {
    it("gives the public key, saves a valid subscription, refuses junk", async () => {
        const { user, client } = await createSignedInUser();
        await expect(client.get("/notifications/push/public-key")).resolves.toMatchObject({ body: { data: { publicKey: process.env.VAPID_PUBLIC_KEY } } });

        await expect(client.post("/notifications/push/subscriptions", { endpoint: "http://not-https.example/x", keys: subscriptionFor("x").keys })).resolves.toMatchObject({ status: 400 });
        // Only real push services: never an internal address the server would then POST to.
        for (const endpoint of ["https://169.254.169.254/latest", "https://localhost/x", "https://fcm.googleapis.com.evil.example/x", "https://fcm.googleapis.com:8443/x"]) {
            await expect(client.post("/notifications/push/subscriptions", { endpoint, keys: subscriptionFor("x").keys })).resolves.toMatchObject({ status: 400 });
        }
        await expect(client.post("/notifications/push/subscriptions", { endpoint: subscriptionFor("x").endpoint, keys: { p256dh: "<script>", auth: "a" } })).resolves.toMatchObject({ status: 400 });
        await expect(client.post("/notifications/push/subscriptions", subscriptionFor("laptop"))).resolves.toMatchObject({ status: 201 });
        // Saving the same browser again updates it instead of duplicating.
        await client.post("/notifications/push/subscriptions", subscriptionFor("laptop"));
        expect(await prisma.pushSubscription.count({ where: { userId: user.id } })).toBe(1);
    });

    it("a browser can only remove its own account's subscription", async () => {
        const first = await createSignedInUser();
        const second = await createSignedInUser();
        await first.client.post("/notifications/push/subscriptions", subscriptionFor("shared"));

        await expect(second.client.raw("delete", "/notifications/push/subscriptions").send({ endpoint: subscriptionFor("shared").endpoint })).resolves.toMatchObject({ status: 204 });
        expect(await prisma.pushSubscription.count()).toBe(1);
        await first.client.raw("delete", "/notifications/push/subscriptions").send({ endpoint: subscriptionFor("shared").endpoint });
        expect(await prisma.pushSubscription.count()).toBe(0);
    });
});

describe("dispatching notifications", () => {
    it("pushes a new notification once, to accounts with push on", async () => {
        const team = await createTeam();
        await team.member.client.put("/notifications/preferences", { pushEnabled: true });
        await team.member.client.post("/notifications/push/subscriptions", subscriptionFor("member-phone"));
        await assignToMember(team);

        await expect(dispatchPendingNotifications()).resolves.toBe(1);
        await expect(dispatchPendingNotifications()).resolves.toBe(0);

        expect(testPushOutbox.sent).toHaveLength(1);
        const [push] = testPushOutbox.sent;
        expect(push!.endpoint).toBe(subscriptionFor("member-phone").endpoint);
        expect(push!.payload).toMatchObject({ title: "Assigned to you", body: "Olu Owner: Ship the release" });
        expect(push!.payload.url).toMatch(/^\/notifications\?open=/);
    });

    it("doesn't push when the recipient has push off", async () => {
        const team = await createTeam();
        await team.member.client.post("/notifications/push/subscriptions", subscriptionFor("member-phone"));
        await assignToMember(team);

        await expect(dispatchPendingNotifications()).resolves.toBe(1);
        expect(testPushOutbox.sent).toHaveLength(0);
    });

    it("drops a subscription the push service says is gone", async () => {
        const team = await createTeam();
        await team.member.client.put("/notifications/preferences", { pushEnabled: true });
        await team.member.client.post("/notifications/push/subscriptions", subscriptionFor("old-browser"));
        testPushOutbox.goneEndpoints.add(subscriptionFor("old-browser").endpoint);
        await assignToMember(team);

        await dispatchPendingNotifications();
        expect(await prisma.pushSubscription.count()).toBe(0);
    });

    it("never replays old notifications", async () => {
        const team = await createTeam();
        await team.member.client.put("/notifications/preferences", { pushEnabled: true });
        await team.member.client.post("/notifications/push/subscriptions", subscriptionFor("member-phone"));
        await assignToMember(team);
        await prisma.notification.updateMany({ data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) } });

        await expect(dispatchPendingNotifications()).resolves.toBe(0);
        expect(testPushOutbox.sent).toHaveLength(0);
    });
});

describe("GET /events (Server-Sent Events)", () => {
    // Reads the stream until `predicate` matches the text received so far.
    const readUntil = async (body: ReadableStream<Uint8Array>, predicate: (text: string) => boolean) => {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let text = "";
        const deadline = Date.now() + 15_000;
        while (!predicate(text)) {
            if (Date.now() > deadline) throw new Error(`Timed out waiting on the stream. Got: ${text}`);
            const { value, done } = await reader.read();
            if (done) break;
            text += decoder.decode(value, { stream: true });
        }
        reader.releaseLock();
        return text;
    };

    it("refuses anonymous connections", async () => {
        const server = await startServer();
        try {
            const response = await fetch(`${server.baseUrl}/events`);
            expect(response.status).toBe(401);
        } finally {
            await server.stop();
        }
    });

    it("streams comment events to workspace members (ids only), not to outsiders", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);
        const server = await startServer();
        const memberAbort = new AbortController();
        const outsiderAbort = new AbortController();
        try {
            const memberStream = await fetch(`${server.baseUrl}/events`, {
                headers: { Cookie: `${ACCESS_TOKEN_COOKIE}=${team.member.client.accessToken}` },
                signal: memberAbort.signal,
            });
            expect(memberStream.status).toBe(200);
            expect(memberStream.headers.get("content-type")).toMatch(/text\/event-stream/);
            const outsiderStream = await fetch(`${server.baseUrl}/events`, {
                headers: { Cookie: `${ACCESS_TOKEN_COOKIE}=${team.outsider.client.accessToken}` },
                signal: outsiderAbort.signal,
            });
            await readUntil(memberStream.body!, (text) => text.includes("event: ready"));
            await readUntil(outsiderStream.body!, (text) => text.includes("event: ready"));

            const comment = await team.owner.client.post(`/tasks/${task.id}/comments`, { body: "Secret plans" });
            expect(comment.status).toBe(201);

            const received = await readUntil(memberStream.body!, (text) => text.includes("event: comment"));
            expect(received).toContain(`"taskId":"${task.id}"`);
            expect(received).toContain(`"commentId":"${comment.body.data.comment.id}"`);
            expect(received).not.toContain("Secret plans");

            // The outsider's stream got nothing but heartbeats. Give delivery a moment first.
            await new Promise((resolve) => setTimeout(resolve, 300));
            const outsiderReader = outsiderStream.body!.getReader();
            const pending = await Promise.race([outsiderReader.read().then(() => "data"), new Promise((resolve) => setTimeout(() => resolve("quiet"), 500))]);
            expect(pending).toBe("quiet");
            outsiderReader.releaseLock();
        } finally {
            memberAbort.abort();
            outsiderAbort.abort();
            await server.stop();
        }
    });

    it("tells the recipient's open tabs about a new notification", async () => {
        const team = await createTeam();
        const server = await startServer();
        const abort = new AbortController();
        try {
            const stream = await fetch(`${server.baseUrl}/events`, {
                headers: { Cookie: `${ACCESS_TOKEN_COOKIE}=${team.member.client.accessToken}` },
                signal: abort.signal,
            });
            await readUntil(stream.body!, (text) => text.includes("event: ready"));
            await assignToMember(team);
            await dispatchPendingNotifications();

            const received = await readUntil(stream.body!, (text) => text.includes("event: notification"));
            expect(received).toMatch(/"notificationId":"[0-9a-f-]{36}"/);
        } finally {
            abort.abort();
            await server.stop();
        }
    });
});
