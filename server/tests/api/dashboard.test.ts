// API: dashboard counts (SRS SR14) — every count equals the list it links to.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createProject, createTask, createTeam } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

const HOUR = 60 * 60 * 1000;

describe("dashboard", () => {
    it("each count matches its drill-down list", async () => {
        const team = await createTeam();
        const mine = team.member.membership.id;
        const now = Date.now();
        await createTask(team.workspace.id, team.owner.user.id, { title: "Late", assigneeMembershipId: mine, dueAt: new Date(now - 48 * HOUR) });
        await createTask(team.workspace.id, team.owner.user.id, { title: "Working", assigneeMembershipId: mine, status: "in_progress" });
        const done = await createTask(team.workspace.id, team.owner.user.id, { title: "Shipped", assigneeMembershipId: mine, status: "completed" });
        await prisma.task.update({ where: { id: done.id }, data: { completedAt: new Date() } });
        const parent = await createTask(team.workspace.id, team.owner.user.id, { title: "Parent", dueAt: new Date(now - 24 * HOUR) });
        // A subtask assigned to me: counts for me, but not in workspace totals.
        await team.owner.client.post(`/tasks/${parent.id}/subtasks`, { title: "My piece", assigneeMembershipId: mine, status: "in_progress" });

        const client = team.member.client;
        const dashboard = (await client.get(`/workspaces/${team.workspace.id}/dashboard`)).body.data;
        const listLength = async (query: string) => (await client.get(`/workspaces/${team.workspace.id}/tasks?${query}`)).body.data.tasks.length;

        expect(dashboard.personal.overdue).toBe(await listLength("assignee=me&due=overdue"));
        expect(dashboard.personal.dueToday).toBe(await listLength("assignee=me&due=today"));
        expect(dashboard.personal.inProgress).toBe(await listLength("assignee=me&status=in_progress"));
        expect(dashboard.personal.completedThisWeek).toBe(await listLength("assignee=me&due=week"));
        expect(dashboard.personal).toMatchObject({ overdue: 1, inProgress: 2, completedThisWeek: 1 });

        expect(dashboard.workspace.open).toBe(await listLength("due=open"));
        expect(dashboard.workspace.overdue).toBe(await listLength("due=overdue"));
        expect(dashboard.workspace.completed).toBe(await listLength("due=completed"));
        // Top-level only: Late, Working, Parent are open; the subtask isn't counted.
        expect(dashboard.workspace).toMatchObject({ open: 3, overdue: 2, completed: 1 });
    });

    it("project progress uses top-level tasks; empty projects have no percentage; archived are left out", async () => {
        const team = await createTeam();
        const launch = await createProject(team.workspace.id, team.owner.user.id, { name: "Launch" });
        await createProject(team.workspace.id, team.owner.user.id, { name: "Empty" });
        const archived = await createProject(team.workspace.id, team.owner.user.id, { name: "Old", state: "archived" });
        const parent = await createTask(team.workspace.id, team.owner.user.id, { projectId: launch.id, status: "completed" });
        await createTask(team.workspace.id, team.owner.user.id, { projectId: launch.id });
        await team.owner.client.post(`/tasks/${parent.id}/subtasks`, { title: "child" });
        await createTask(team.workspace.id, team.owner.user.id, { projectId: archived.id });

        const dashboard = (await team.owner.client.get(`/workspaces/${team.workspace.id}/dashboard`)).body.data;
        const byName = Object.fromEntries(dashboard.projects.map((project: { name: string }) => [project.name, project]));
        expect(byName.Launch).toMatchObject({ total: 2, completed: 1, open: 1, percentComplete: 50 });
        expect(byName.Empty).toMatchObject({ total: 0, percentComplete: null });
        expect(byName.Old).toBeUndefined();
        expect(dashboard.workspace).toMatchObject({ open: 1, activeProjects: 2 });
    });

    it("outsiders get 404", async () => {
        const team = await createTeam();
        await expect(team.outsider.client.get(`/workspaces/${team.workspace.id}/dashboard`)).resolves.toMatchObject({ status: 404 });
    });
});
