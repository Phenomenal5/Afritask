// E2E: the PRD core journeys (J1–J6), each driven like a user would — over real HTTP,
// following the actual links in the emails the app sends. Nothing is set up in the
// database directly except where the journey starts from an existing account.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "@jest/globals";
import { runReminderSweep } from "../../src/jobs/taskReminder.js";
import { createBrowser, startServer, type Browser } from "../helpers/browser.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { uniqueEmail } from "../helpers/factories.js";
import { INVITE_LINK, VERIFY_LINK, clearMailbox, emailsTo, tokenFromEmail } from "../helpers/mailbox.js";

let server: Awaited<ReturnType<typeof startServer>>;

beforeAll(async () => {
    server = await startServer();
});
beforeEach(async () => {
    await resetDatabase();
    clearMailbox();
});
afterAll(async () => {
    await server.stop();
    await disconnectDatabase();
});

const PASSWORD = "journey-pass-1";

// Sign up → verify via the emailed link → sign in. Returns a signed-in browser.
const registerAndSignIn = async (name: string, email = uniqueEmail(name.toLowerCase())) => {
    const browser = createBrowser(server.baseUrl);
    await expect(browser.post("/auth/signup", { name, email, password: PASSWORD, timezone: "Africa/Lagos", acceptTerms: true })).resolves.toMatchObject({ status: 201 });
    const verifyToken = tokenFromEmail(email, VERIFY_LINK);
    await expect(browser.get(`/auth/verify-email/${verifyToken}`)).resolves.toMatchObject({ status: 200 });
    await expect(browser.post("/auth/login", { email, password: PASSWORD })).resolves.toMatchObject({ status: 200 });
    return { browser, email };
};

const createWorkspaceAs = async (browser: Browser, name: string) => {
    const response = await browser.post("/workspaces", { name });
    expect(response.status).toBe(201);
    return response.body.data.workspace.id as string;
};

const membershipIdOf = async (browser: Browser, workspaceId: string, email: string) => {
    const details = await browser.get(`/workspaces/${workspaceId}`);
    return details.body.data.workspace.members.find((member: { user: { email: string } }) => member.user.email === email).id as string;
};

const inviteAndAccept = async (inviter: Browser, workspaceId: string, invitee: { browser: Browser; email: string }, role = "member") => {
    await expect(inviter.post(`/workspaces/${workspaceId}/invitations`, { email: invitee.email, role })).resolves.toMatchObject({ status: 201 });
    const token = tokenFromEmail(invitee.email, INVITE_LINK);
    await expect(invitee.browser.post("/invitations/accept", { token })).resolves.toMatchObject({ status: 200 });
};

describe("PRD core journeys", () => {
    it("J1 — an individual signs up and completes their first task", async () => {
        const { browser } = await registerAndSignIn("Ifeoma");

        // No workspace yet → onboarding creates one.
        await expect(browser.get("/workspaces")).resolves.toMatchObject({ body: { results: 0 } });
        const workspaceId = await createWorkspaceAs(browser, "Ifeoma's workspace");
        const myMembershipId = await membershipIdOf(browser, workspaceId, (await browser.get("/auth/me")).body.user.email);

        // A title-only quick task, no project, then details later.
        const created = await browser.post(`/workspaces/${workspaceId}/tasks`, { title: "Send the invoice", assigneeMembershipId: myMembershipId });
        expect(created.status).toBe(201);
        const task = created.body.data.task;
        const withDue = await browser.put(`/tasks/${task.id}`, { dueDate: "2026-12-01", version: task.version });
        // Lagos profile timezone → due 23:59 local = 22:59Z.
        expect(withDue.body.data.task.dueAt).toBe("2026-12-01T22:59:00.000Z");

        // It's in "my tasks", and completing it records the time.
        await expect(browser.get(`/workspaces/${workspaceId}/tasks?assignee=me`)).resolves.toMatchObject({ body: { results: 1 } });
        const completed = await browser.patch(`/tasks/${task.id}/status`, { status: "completed", version: withDue.body.data.task.version });
        expect(completed.body.data.task).toMatchObject({ status: "completed" });
        expect(completed.body.data.task.completedAt).not.toBeNull();
    });

    it("J2 — inviting an existing user (in-app acceptance)", async () => {
        const owner = await registerAndSignIn("Owner");
        const existing = await registerAndSignIn("Existing");
        const workspaceId = await createWorkspaceAs(owner.browser, "Agency");

        await owner.browser.post(`/workspaces/${workspaceId}/invitations`, { email: existing.email, role: "admin" });
        // The existing user sees it in-app, reviews it, accepts.
        const mine = await existing.browser.get("/invitations/mine");
        expect(mine.body.data.invitations).toEqual([expect.objectContaining({ workspaceName: "Agency", role: "admin", inviterName: "Owner" })]);
        await expect(existing.browser.post("/invitations/accept", { invitationId: mine.body.data.invitations[0].id })).resolves.toMatchObject({ status: 200 });

        // The workspace is now selectable, with the offered role.
        const list = await existing.browser.get("/workspaces");
        expect(list.body.data.workspaces).toEqual([expect.objectContaining({ id: workspaceId, role: "admin" })]);
    });

    it("J3 — inviting someone with no account (link survives sign-up and verification)", async () => {
        const owner = await registerAndSignIn("Owner");
        const workspaceId = await createWorkspaceAs(owner.browser, "Studio");
        const newcomerEmail = uniqueEmail("newcomer");
        await owner.browser.post(`/workspaces/${workspaceId}/invitations`, { email: newcomerEmail });
        const inviteToken = tokenFromEmail(newcomerEmail, INVITE_LINK);

        // Opening the link signed out shows the invitation but grants nothing.
        const visitor = createBrowser(server.baseUrl);
        await expect(visitor.get(`/invitations/preview/${inviteToken}`)).resolves.toMatchObject({ status: 200, body: { data: { invitation: { status: "pending" } } } });
        await expect(visitor.post("/invitations/accept", { token: inviteToken })).resolves.toMatchObject({ status: 401 });

        // Someone signed in with ANOTHER email can't use it.
        const wrongAccount = await registerAndSignIn("Wrong");
        await expect(wrongAccount.browser.post("/invitations/accept", { token: inviteToken })).resolves.toMatchObject({ status: 403 });

        // The newcomer registers with the invited email, verifies, signs in, then accepts.
        await visitor.post("/auth/signup", { name: "Newcomer", email: newcomerEmail, password: PASSWORD, acceptTerms: true });
        await visitor.get(`/auth/verify-email/${tokenFromEmail(newcomerEmail, VERIFY_LINK)}`);
        await expect(visitor.post("/auth/login", { email: newcomerEmail, password: PASSWORD })).resolves.toMatchObject({ status: 200 });
        await expect(visitor.post("/invitations/accept", { token: inviteToken })).resolves.toMatchObject({ status: 200 });
        await expect(visitor.get(`/workspaces/${workspaceId}`)).resolves.toMatchObject({ status: 200 });
    });

    it("J4 — completing shared work (assign → in progress → review → done, counts update)", async () => {
        const admin = await registerAndSignIn("Admin");
        const member = await registerAndSignIn("Member");
        const workspaceId = await createWorkspaceAs(admin.browser, "Team");
        await inviteAndAccept(admin.browser, workspaceId, member);
        const memberMembershipId = await membershipIdOf(admin.browser, workspaceId, member.email);

        const project = (await admin.browser.post(`/workspaces/${workspaceId}/projects`, { name: "API v2" })).body.data.project;
        const task = (await admin.browser.post(`/workspaces/${workspaceId}/tasks`, { title: "Build endpoint", projectId: project.id, assigneeMembershipId: memberMembershipId })).body.data.task;

        // The member finds their work and moves it along.
        await expect(member.browser.get(`/workspaces/${workspaceId}/tasks?assignee=me`)).resolves.toMatchObject({ body: { results: 1 } });
        let version = task.version;
        for (const status of ["in_progress", "in_review", "completed"]) {
            const moved = await member.browser.patch(`/tasks/${task.id}/status`, { status, version });
            expect(moved.status).toBe(200);
            version = moved.body.data.task.version;
        }

        const projectNow = await admin.browser.get(`/projects/${project.id}`);
        expect(projectNow.body.data.project.taskCounts).toEqual({ total: 1, completed: 1, open: 0 });
    });

    it("J5 — a deadline reminder reaches the assignee, and a completed task stays quiet", async () => {
        const owner = await registerAndSignIn("Owner");
        const assignee = await registerAndSignIn("Assignee");
        const workspaceId = await createWorkspaceAs(owner.browser, "Ops");
        await inviteAndAccept(owner.browser, workspaceId, assignee);
        const assigneeMembershipId = await membershipIdOf(owner.browser, workspaceId, assignee.email);

        // Due in two hours, reminder one hour before: the sweep acts once that hour arrives.
        const dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        const inAnHour = new Date(Date.now() + 61 * 60 * 1000);
        const reminded = (await owner.browser.post(`/workspaces/${workspaceId}/tasks`, { title: "Renew domain", dueAt, reminderOffset: "one_hour", assigneeMembershipId })).body.data.task;
        const finished = (await owner.browser.post(`/workspaces/${workspaceId}/tasks`, { title: "Pay invoice", dueAt, reminderOffset: "one_hour", assigneeMembershipId })).body.data.task;
        expect(reminded.remindAt).not.toBeNull();

        // Completing a task cancels its pending reminder.
        await assignee.browser.patch(`/tasks/${finished.id}/status`, { status: "completed", version: finished.version });

        clearMailbox();
        await runReminderSweep(inAnHour);
        expect(emailsTo(assignee.email).map((email) => email.subject)).toEqual(["Task Reminder: Renew domain"]);

        // The assignee also sees it in-app.
        const inbox = await assignee.browser.get("/notifications");
        expect(inbox.body.data.notifications.map((notification: { type: string }) => notification.type)).toContain("task_reminder");
    });

    it("J6 — a member leaves: access stops, open work is unassigned, history stays", async () => {
        const owner = await registerAndSignIn("Owner");
        const leaver = await registerAndSignIn("Leaver");
        const workspaceId = await createWorkspaceAs(owner.browser, "Crew");
        await inviteAndAccept(owner.browser, workspaceId, leaver);
        const leaverMembershipId = await membershipIdOf(owner.browser, workspaceId, leaver.email);

        const theirTask = (await leaver.browser.post(`/workspaces/${workspaceId}/tasks`, { title: "Written by leaver" })).body.data.task;
        const assigned = (await owner.browser.post(`/workspaces/${workspaceId}/tasks`, { title: "Assigned to leaver", assigneeMembershipId: leaverMembershipId })).body.data.task;

        // The Owner can't abandon the workspace; the member can leave.
        await expect(owner.browser.post(`/workspaces/${workspaceId}/leave`)).resolves.toMatchObject({ status: 409 });
        await expect(leaver.browser.post(`/workspaces/${workspaceId}/leave`)).resolves.toMatchObject({ status: 200 });

        // Access stops — including retained direct links.
        await expect(leaver.browser.get(`/workspaces/${workspaceId}`)).resolves.toMatchObject({ status: 404 });
        await expect(leaver.browser.get(`/tasks/${theirTask.id}`)).resolves.toMatchObject({ status: 404 });

        // Their open assignment is cleared; their authored task keeps its attribution.
        const assignedNow = await owner.browser.get(`/tasks/${assigned.id}`);
        expect(assignedNow.body.data.task.assigneeMembershipId).toBeNull();
        const authored = await prisma.task.findUniqueOrThrow({ where: { id: theirTask.id }, include: { creator: true } });
        expect(authored.creator.email).toBe(leaver.email);
    });

    it("logout ends the browser's session", async () => {
        const { browser } = await registerAndSignIn("Logout");
        await expect(browser.post("/auth/logout")).resolves.toMatchObject({ status: 200 });
        expect(browser.cookies.has("afritask_access")).toBe(false);
        expect(browser.cookies.has("afritask_refresh")).toBe(false);
        await expect(browser.get("/auth/me")).resolves.toMatchObject({ status: 401 });
    });
});
