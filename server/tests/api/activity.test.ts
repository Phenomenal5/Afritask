// API: activity history (SRS SR09) — who changed what, with before/after values, read-only.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createProject, createTask, createTeam } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

type Entry = { action: string; changes: Record<string, { from: unknown; to: unknown }> | null; summary: string; actor: { name: string } };

describe("task history", () => {
    it("records creation and each edit with before/after values and the actor", async () => {
        const team = await createTeam();
        const label = await prisma.label.create({ data: { workspaceId: team.workspace.id, name: "Bug", color: "clay" } });
        const created = await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Draft brief" });
        const task = created.body.data.task;

        await team.owner.client.put(`/tasks/${task.id}`, {
            version: task.version,
            title: "Final brief",
            priority: "urgent",
            assigneeMembershipId: team.member.membership.id,
            labelIds: [label.id],
        });
        await team.member.client.patch(`/tasks/${task.id}/status`, { status: "completed", completionNote: "Done", version: task.version + 1 });

        const history = await team.admin.client.get(`/tasks/${task.id}/activity`);
        expect(history.status).toBe(200);
        const entries: Entry[] = history.body.data.entries;
        expect(entries.map((entry) => entry.action)).toEqual(["task.updated", "task.updated", "task.created"]);

        // Newest first: the member completed it.
        expect(entries[0].actor.name).toBe("Musa Member");
        expect(entries[0].changes).toEqual({ status: { from: "todo", to: "completed" }, completionNote: { from: null, to: "Done" } });

        // Names, not ids, so history reads the same after renames/removals.
        expect(entries[1].actor.name).toBe("Olu Owner");
        expect(entries[1].changes).toEqual({
            title: { from: "Draft brief", to: "Final brief" },
            priority: { from: "medium", to: "urgent" },
            assignee: { from: null, to: "Musa Member" },
            labels: { from: [], to: ["Bug"] },
        });
        expect(entries[2]).toMatchObject({ summary: "Draft brief", changes: null });
    });

    it("a no-op save and a stale (409) save leave no entry", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id, { title: "Same" });

        await team.owner.client.put(`/tasks/${task.id}`, { version: 1, title: "Same" });
        const stale = await team.owner.client.put(`/tasks/${task.id}`, { version: 1, title: "Lost edit" });
        expect(stale.status).toBe(409);

        const history = await team.owner.client.get(`/tasks/${task.id}/activity`);
        expect(history.body.data.entries).toEqual([]);
    });

    it("a subtask shows on its parent's timeline", async () => {
        const team = await createTeam();
        const parent = await createTask(team.workspace.id, team.owner.user.id);
        await team.member.client.post(`/tasks/${parent.id}/subtasks`, { title: "Deploy" });

        const history = await team.owner.client.get(`/tasks/${parent.id}/activity`);
        expect(history.body.data.entries).toMatchObject([{ action: "subtask.created", summary: "Deploy", actor: { name: "Musa Member" } }]);
    });

    it("outsiders get 404, like any other cross-workspace resource", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);
        await expect(team.outsider.client.get(`/tasks/${task.id}/activity`)).resolves.toMatchObject({ status: 404 });
        await expect(team.outsider.client.get(`/workspaces/${team.workspace.id}/activity`)).resolves.toMatchObject({ status: 404 });
    });
});

describe("workspace and project feeds", () => {
    it("a deleted task keeps its history in the workspace feed", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id, { title: "Short-lived" });
        await team.owner.client.delete(`/tasks/${task.id}`);

        const feed = await team.member.client.get(`/workspaces/${team.workspace.id}/activity`);
        expect(feed.body.data.entries).toMatchObject([{ action: "task.deleted", entityId: task.id, summary: "Short-lived" }]);
    });

    it("a project's feed holds its own events and its tasks' events", async () => {
        const team = await createTeam();
        const created = await team.owner.client.post(`/workspaces/${team.workspace.id}/projects`, { name: "Launch" });
        const project = created.body.data.project;
        await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "In project", projectId: project.id });
        await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Elsewhere" });
        await team.owner.client.post(`/projects/${project.id}/archive`);
        await team.owner.client.post(`/projects/${project.id}/restore`);

        const feed = await team.owner.client.get(`/workspaces/${team.workspace.id}/activity?projectId=${project.id}`);
        const entries: Entry[] = feed.body.data.entries;
        expect(entries.map((entry) => entry.action)).toEqual(["project.restored", "project.archived", "task.created", "project.created"]);
        expect(entries[0].changes).toEqual({ state: { from: "archived", to: "active" } });
    });

    it("records role changes, removals and ownership transfer", async () => {
        const team = await createTeam();
        await team.owner.client.patch(`/workspaces/${team.workspace.id}/members/${team.member.membership.id}`, { role: "admin" });
        await team.owner.client.delete(`/workspaces/${team.workspace.id}/members/${team.member.membership.id}`);
        await team.owner.client.post(`/workspaces/${team.workspace.id}/transfer-ownership`, { membershipId: team.admin.membership.id });

        const feed = await team.admin.client.get(`/workspaces/${team.workspace.id}/activity`);
        expect(feed.body.data.entries).toMatchObject([
            { action: "ownership.transferred", changes: { owner: { from: "Olu Owner", to: "Ada Admin" } } },
            { action: "member.removed", summary: "Musa Member" },
            { action: "member.role_changed", changes: { role: { from: "member", to: "admin" } } },
        ]);
    });

    it("pages newest first with ?limit and ?before", async () => {
        const team = await createTeam();
        for (const title of ["one", "two", "three"]) {
            await team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title });
        }
        const firstPage = await team.owner.client.get(`/workspaces/${team.workspace.id}/activity?limit=2`);
        expect(firstPage.body.data.entries.map((entry: Entry) => entry.summary)).toEqual(["three", "two"]);
        expect(firstPage.body.data.nextCursor).toBeTruthy();

        const secondPage = await team.owner.client.get(`/workspaces/${team.workspace.id}/activity?limit=2&before=${firstPage.body.data.nextCursor}`);
        expect(secondPage.body.data.entries.map((entry: Entry) => entry.summary)).toEqual(["one"]);
        expect(secondPage.body.data.nextCursor).toBeNull();
    });
});

describe("immutability", () => {
    it("the database refuses to edit an entry", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);
        await team.owner.client.delete(`/tasks/${task.id}`);
        const entry = await prisma.activity.findFirstOrThrow({ where: { entityId: task.id } });

        await expect(prisma.activity.update({ where: { id: entry.id }, data: { summary: "rewritten" } })).rejects.toThrow(/immutable/);
    });
});
