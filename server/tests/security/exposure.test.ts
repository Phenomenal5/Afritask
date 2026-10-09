// Security: what the API reveals — secrets in responses, headers, CORS, cookies, emails.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { anonymous, createClient } from "../helpers/client.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createSignedInUser, createTask, createTeam, uniqueEmail } from "../helpers/factories.js";
import { clearMailbox, lastEmailTo, testMailbox } from "../helpers/mailbox.js";
import { sendDueTomorrowReminders } from "../../src/jobs/taskReminder.js";

beforeEach(async () => {
    await resetDatabase();
    clearMailbox();
});
afterAll(disconnectDatabase);

const SECRET_KEYS = /"(password|tokenHash|secretHash|legacyMongoId|verifyEmailToken|resetPasswordToken)"/;

describe("no secrets in responses", () => {
    it("none of the user/workspace/task/invitation responses carry credential fields", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id, { assigneeMembershipId: team.member.membership.id });
        const invited = await team.owner.client.post(`/workspaces/${team.workspace.id}/invitations`, { email: uniqueEmail() });
        const login = await createClient().post("/auth/login", { email: team.admin.user.email, password: "correct-horse-1" });

        const responses = await Promise.all([
            team.owner.client.get("/auth/me"),
            team.owner.client.get("/workspaces"),
            team.owner.client.get(`/workspaces/${team.workspace.id}`),
            team.owner.client.get(`/workspaces/${team.workspace.id}/tasks`),
            team.owner.client.get(`/tasks/${task.id}`),
            team.owner.client.get(`/workspaces/${team.workspace.id}/invitations`),
            team.owner.client.put("/users/profile", { name: "Olu" }),
        ]);
        for (const response of [...responses, invited, login]) {
            expect(JSON.stringify(response.body)).not.toMatch(SECRET_KEYS);
        }
        expect(login.body.token).toBeUndefined();
    });

    it("the session secret in the cookie is never stored as-is", async () => {
        const { client } = await createSignedInUser();
        const sessions = await prisma.session.findMany();
        expect(JSON.stringify(sessions)).not.toContain(client.sessionSecret!);
    });
});

describe("HTTP security headers (helmet)", () => {
    it("sets the hardening headers and hides the framework", async () => {
        const response = await anonymous().get("/api/auth/me");
        expect(response.headers["x-content-type-options"]).toBe("nosniff");
        expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
        expect(response.headers["content-security-policy"]).toContain("default-src 'self'");
        expect(response.headers["strict-transport-security"]).toBeDefined();
        expect(response.headers["referrer-policy"]).toBeDefined();
        expect(response.headers["x-powered-by"]).toBeUndefined();
    });
});

describe("CORS", () => {
    it("only allows the configured client origin", async () => {
        const allowed = await anonymous().options("/api/auth/login").set("Origin", "http://client.test").set("Access-Control-Request-Method", "POST");
        expect(allowed.headers["access-control-allow-origin"]).toBe("http://client.test");

        const evil = await anonymous().options("/api/auth/login").set("Origin", "https://evil.example").set("Access-Control-Request-Method", "POST");
        expect(evil.headers["access-control-allow-origin"]).not.toBe("https://evil.example");
    });

    it("a cross-site preflight can't get X-Requested-With approved for a foreign origin", async () => {
        const preflight = await anonymous()
            .options("/api/workspaces")
            .set("Origin", "https://evil.example")
            .set("Access-Control-Request-Method", "POST")
            .set("Access-Control-Request-Headers", "x-requested-with");
        expect(preflight.headers["access-control-allow-origin"]).not.toBe("https://evil.example");
    });
});

describe("cookies", () => {
    it("the session cookie is HttpOnly + SameSite=Lax (Secure is added in production)", async () => {
        const { user } = await createSignedInUser();
        const response = await createClient().post("/auth/login", { email: user.email, password: "correct-horse-1" });
        const cookie = (response.headers["set-cookie"] as unknown as string[]).find((value) => value.startsWith("afritask_session="))!;
        expect(cookie).toMatch(/HttpOnly/);
        expect(cookie).toMatch(/SameSite=Lax/);
        expect(cookie).not.toMatch(/Domain=/i);
    });
});

describe("HTML injection in outgoing email", () => {
    it("escapes a hostile workspace name and inviter name in invitation emails", async () => {
        const { client, user } = await createSignedInUser({ name: `<img src=x onerror=alert(1)>` });
        void user;
        const workspace = await client.post("/workspaces", { name: `<script>alert("ws")</script>` });
        const email = uniqueEmail();
        await client.post(`/workspaces/${workspace.body.data.workspace.id}/invitations`, { email });

        const { html } = lastEmailTo(email);
        expect(html).not.toContain("<script>alert");
        expect(html).not.toContain("<img src=x");
        expect(html).toContain("&lt;script&gt;");
    });

    it("escapes a hostile task title and description in reminder emails", async () => {
        const team = await createTeam();
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        await prisma.task.create({
            data: {
                workspaceId: team.workspace.id,
                creatorId: team.owner.user.id,
                title: `<a href="https://phish.example">Click</a>`,
                description: `<script>steal()</script>`,
                dueAt: new Date(`${tomorrow.toISOString().slice(0, 10)}T12:00:00Z`),
            },
        });
        await sendDueTomorrowReminders();
        const html = testMailbox.sent.map((sent) => sent.html).join("");
        expect(html).not.toContain(`<a href="https://phish.example">`);
        expect(html).not.toContain("<script>steal");
    });
});
