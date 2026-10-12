// API: performance for a chosen set of workspaces, share links that list their workspaces,
// and the team view where an Owner or Admin sees each member's month in ONE workspace.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { anonymous } from "../helpers/client.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createTeam, createWorkspace } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

const at = (isoInstant: string) => new Date(isoInstant);

// Musa (a Member of the team's workspace) also owns a workspace of his own. In September he
// finishes two tasks in the team's workspace and one in his own, and creates a project and
// writes a comment in the team's workspace.
const buildTwoWorkspaces = async () => {
    const team = await createTeam();
    const musa = team.member;
    const own = await createWorkspace(musa.user.id, "Musa's Side Work");
    const teamTask = { workspaceId: team.workspace.id, creatorId: musa.user.id, assigneeMembershipId: musa.membership.id, status: "completed" as const };

    await prisma.task.createMany({
        data: [
            // Before its first deadline.
            { ...teamTask, title: "On time", dueAt: at("2026-09-10T17:00:00Z"), originalDueAt: at("2026-09-10T17:00:00Z"), completedAt: at("2026-09-09T12:00:00Z"), createdAt: at("2026-09-01T09:00:00Z") },
            // After its first deadline, within the extended one.
            { ...teamTask, title: "Extended", dueAt: at("2026-09-20T17:00:00Z"), originalDueAt: at("2026-09-14T17:00:00Z"), dueExtensionCount: 1, completedAt: at("2026-09-15T12:00:00Z"), createdAt: at("2026-09-02T09:00:00Z") },
            { workspaceId: own.workspace.id, creatorId: musa.user.id, assigneeMembershipId: own.ownerMembership.id, status: "completed", title: "Side job", completedAt: at("2026-09-05T12:00:00Z"), createdAt: at("2026-09-03T09:00:00Z") },
        ],
    });
    const project = await prisma.project.create({ data: { workspaceId: team.workspace.id, name: "Launch", createdById: musa.user.id, createdAt: at("2026-09-04T09:00:00Z") } });
    const anyTeamTask = await prisma.task.findFirstOrThrow({ where: { title: "On time" } });
    await prisma.comment.create({ data: { taskId: anyTeamTask.id, workspaceId: team.workspace.id, authorId: musa.user.id, body: "Done", createdAt: at("2026-09-09T13:00:00Z") } });
    // The Owner's own work in the team's workspace (for the "Admins can't see it" checks).
    await prisma.task.create({ data: { workspaceId: team.workspace.id, creatorId: team.owner.user.id, assigneeMembershipId: team.owner.membership.id, status: "completed", title: "Owner's", completedAt: at("2026-09-08T12:00:00Z") } });
    return { team, musa, own, project };
};

describe("your performance for chosen workspaces", () => {
    it("covers everything by default, or only the workspaces you pick, with the activity counts", async () => {
        const { team, musa, own } = await buildTwoWorkspaces();

        const everything = await musa.client.get("/performance?month=2026-09");
        expect(everything.status).toBe(200);
        expect(everything.body.data.summary).toMatchObject({ completed: 3, tasksCreated: 3, projectsCreated: 1, commentsWritten: 1 });
        expect(everything.body.data.scope).toEqual({ workspaceIds: null });

        const teamOnly = await musa.client.get(`/performance?month=2026-09&workspaces=${team.workspace.id}`);
        expect(teamOnly.body.data.summary).toMatchObject({
            completed: 2,
            completedOnTime: 2,
            metWithoutExtending: 1,
            completedAfterOriginalDue: 1,
            tasksCreated: 2,
            projectsCreated: 1,
            commentsWritten: 1,
        });

        const ownOnly = await musa.client.get(`/performance?month=2026-09&workspaces=${own.workspace.id}`);
        expect(ownOnly.body.data.summary).toMatchObject({ completed: 1, projectsCreated: 0, commentsWritten: 0 });
    });

    it("only workspaces you're in can be picked", async () => {
        const { team, musa } = await buildTwoWorkspaces();
        const strangers = await createWorkspace(team.outsider.user.id, "Not Musa's");
        await expect(musa.client.get(`/performance?workspaces=${strangers.workspace.id}`)).resolves.toMatchObject({ status: 404 });
        await expect(musa.client.get("/performance?workspaces=not-an-id")).resolves.toMatchObject({ status: 400 });
    });
});

describe("share links for chosen workspaces", () => {
    it("shares only the picked workspaces, hides their names unless asked, and ends when none are left", async () => {
        const { team, musa, own } = await buildTwoWorkspaces();
        // The picker always sends a list; an empty one is refused.
        await expect(musa.client.post("/performance/shares", { month: "2026-09", workspaceIds: [] })).resolves.toMatchObject({ status: 400 });

        const hidden = await musa.client.post("/performance/shares", { month: "2026-09", workspaceIds: [team.workspace.id] });
        expect(hidden.status).toBe(201);
        expect(hidden.body.data.share).toMatchObject({ showWorkspaceNames: false, workspaces: [{ id: team.workspace.id, name: "Team Space" }] });
        const hiddenView = await anonymous().get(`/api/v1/performance/shared/${hidden.body.data.share.token}`);
        expect(hiddenView.body.data.summary).toMatchObject({ completed: 2 });
        expect(hiddenView.body.data.scope).toEqual({ allWorkspaces: false, workspaceCount: 1, workspaceNames: null });
        expect(JSON.stringify(hiddenView.body)).not.toMatch(/Team Space/);

        const named = await musa.client.post("/performance/shares", { month: "2026-09", workspaceIds: [team.workspace.id, own.workspace.id], showWorkspaceNames: true });
        const namedView = await anonymous().get(`/api/v1/performance/shared/${named.body.data.share.token}`);
        expect(namedView.body.data.summary).toMatchObject({ completed: 3 });
        expect(namedView.body.data.scope.workspaceNames).toEqual(expect.arrayContaining(["Team Space", "Musa's Side Work"]));

        // Leaving the team's workspace: it drops out of both links; the first has nothing left.
        await prisma.membership.update({ where: { id: musa.membership.id }, data: { status: "removed" } });
        await expect(anonymous().get(`/api/v1/performance/shared/${hidden.body.data.share.token}`)).resolves.toMatchObject({ status: 404 });
        const afterLeaving = await anonymous().get(`/api/v1/performance/shared/${named.body.data.share.token}`);
        expect(afterLeaving.body.data.summary).toMatchObject({ completed: 1 });
        expect(afterLeaving.body.data.scope.workspaceNames).toEqual(["Musa's Side Work"]);
    });

    it("an app version without the picker (no list sent) gets a link to everything, as before", async () => {
        const { musa } = await buildTwoWorkspaces();
        const created = await musa.client.post("/performance/shares", { month: "2026-09" });
        expect(created.status).toBe(201);
        expect(created.body.data.share).toMatchObject({ allWorkspaces: true, workspaces: [] });
        const view = await anonymous().get(`/api/v1/performance/shared/${created.body.data.share.token}`);
        expect(view.body.data.summary).toMatchObject({ completed: 3 });
    });

    it("a link made before links had a list still covers everything", async () => {
        const { musa } = await buildTwoWorkspaces();
        const created = await musa.client.post("/performance/shares", { month: "2026-09", workspaceIds: [(await prisma.membership.findFirstOrThrow({ where: { userId: musa.user.id } })).workspaceId] });
        await prisma.performanceShare.update({ where: { id: created.body.data.share.id }, data: { allWorkspaces: true } });
        const view = await anonymous().get(`/api/v1/performance/shared/${created.body.data.share.token}`);
        expect(view.body.data.summary).toMatchObject({ completed: 3 });
        expect(view.body.data.scope).toMatchObject({ allWorkspaces: true });
    });
});

describe("team performance", () => {
    it("the Owner sees every member's month in this workspace only", async () => {
        const { team } = await buildTwoWorkspaces();
        const response = await team.owner.client.get(`/workspaces/${team.workspace.id}/performance?month=2026-09`);
        expect(response.status).toBe(200);
        const names = response.body.data.members.map((member: { user: { name: string } }) => member.user.name);
        expect(names).toEqual(["Ada Admin", "Musa Member", "Olu Owner"]);
        const musaRow = response.body.data.members.find((member: { user: { name: string } }) => member.user.name === "Musa Member");
        // Musa's own workspace doesn't count here.
        expect(musaRow.summary).toMatchObject({ completed: 2, projectsCreated: 1 });

        const detail = await team.owner.client.get(`/workspaces/${team.workspace.id}/performance/${musaRow.membershipId}?month=2026-09`);
        expect(detail.status).toBe(200);
        expect(detail.body.data.trend).toHaveLength(6);
    });

    it("an Admin sees the members but not the Owner; Members can't open it", async () => {
        const { team } = await buildTwoWorkspaces();
        const adminView = await team.admin.client.get(`/workspaces/${team.workspace.id}/performance?month=2026-09`);
        expect(adminView.status).toBe(200);
        expect(adminView.body.data.members.map((member: { role: string }) => member.role)).not.toContain("owner");
        await expect(team.admin.client.get(`/workspaces/${team.workspace.id}/performance/${team.owner.membership.id}`)).resolves.toMatchObject({ status: 404 });

        await expect(team.member.client.get(`/workspaces/${team.workspace.id}/performance`)).resolves.toMatchObject({ status: 403 });
        await expect(team.outsider.client.get(`/workspaces/${team.workspace.id}/performance`)).resolves.toMatchObject({ status: 404 });
    });
});
