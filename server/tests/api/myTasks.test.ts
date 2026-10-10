// API: My Tasks views on the task list (SRS SR11) — ?assignee=me&due=…&counts=true.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createProject, createTask, createTeam } from "../helpers/factories.js";
import { dayBounds } from "../../src/utils/taskViews.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

const HOUR = 60 * 60 * 1000;

type Listed = { title: string };
const titles = (body: { data: { tasks: Listed[] } }) => body.data.tasks.map((task) => task.title).sort();

describe("My Tasks views", () => {
    it("buckets my work by due date in my timezone, with counts that match the lists", async () => {
        const team = await createTeam();
        const mine = team.member.membership.id;
        const now = new Date();
        const { startOfToday, startOfTomorrow } = dayBounds(now, "UTC");

        await createTask(team.workspace.id, team.owner.user.id, { title: "Overdue last week", assigneeMembershipId: mine, dueAt: new Date(now.getTime() - 7 * 24 * HOUR) });
        // Due earlier today and already passed: both Overdue and Today.
        const earlierToday = new Date(Math.max(startOfToday.getTime() + 1000, now.getTime() - HOUR));
        if (earlierToday < now) await createTask(team.workspace.id, team.owner.user.id, { title: "Earlier today", assigneeMembershipId: mine, dueAt: earlierToday });
        await createTask(team.workspace.id, team.owner.user.id, { title: "Later today", assigneeMembershipId: mine, dueAt: new Date(startOfTomorrow.getTime() - 1000) });
        await createTask(team.workspace.id, team.owner.user.id, { title: "Next week", assigneeMembershipId: mine, dueAt: new Date(now.getTime() + 7 * 24 * HOUR) });
        await createTask(team.workspace.id, team.owner.user.id, { title: "Someday", assigneeMembershipId: mine });
        const done = await createTask(team.workspace.id, team.owner.user.id, { title: "Done", assigneeMembershipId: mine, status: "completed" });
        await prisma.task.update({ where: { id: done.id }, data: { completedAt: now } });
        // Not mine — never in my views.
        await createTask(team.workspace.id, team.owner.user.id, { title: "Someone else's", assigneeMembershipId: team.admin.membership.id, dueAt: new Date(now.getTime() - HOUR) });
        await createTask(team.workspace.id, team.owner.user.id, { title: "Unassigned" });

        const client = team.member.client;
        const list = (due: string) => client.get(`/workspaces/${team.workspace.id}/tasks?assignee=me&due=${due}`);
        const hasEarlierToday = earlierToday < now;

        expect(titles((await list("overdue")).body)).toEqual(hasEarlierToday ? ["Earlier today", "Overdue last week"] : ["Overdue last week"]);
        expect(titles((await list("today")).body)).toEqual(hasEarlierToday ? ["Earlier today", "Later today"] : ["Later today"]);
        expect(titles((await list("upcoming")).body)).toEqual(["Next week"]);
        expect(titles((await list("none")).body)).toEqual(["Someday"]);
        expect(titles((await list("completed")).body)).toEqual(["Done"]);
        expect(titles((await list("week")).body)).toEqual(["Done"]);
        expect((await list("open")).body.data.tasks).toHaveLength(hasEarlierToday ? 5 : 4);

        const withCounts = await client.get(`/workspaces/${team.workspace.id}/tasks?assignee=me&counts=true`);
        expect(withCounts.body.data.counts).toEqual({
            open: hasEarlierToday ? 5 : 4,
            today: hasEarlierToday ? 2 : 1,
            upcoming: 1,
            overdue: hasEarlierToday ? 2 : 1,
            none: 1,
            completed: 1,
            week: 1,
        });
    });

    it("includes subtasks assigned to me with their parent, even when the parent is someone else's", async () => {
        const team = await createTeam();
        const parent = await createTask(team.workspace.id, team.owner.user.id, { title: "Launch", assigneeMembershipId: team.admin.membership.id });
        await team.owner.client.post(`/tasks/${parent.id}/subtasks`, { title: "Write copy", assigneeMembershipId: team.member.membership.id });

        const response = await team.member.client.get(`/workspaces/${team.workspace.id}/tasks?assignee=me&due=open`);
        expect(response.body.data.tasks).toMatchObject([{ title: "Write copy", parent: { id: parent.id, title: "Launch" } }]);
    });

    it("leaves out archived projects and rejects unknown views", async () => {
        const team = await createTeam();
        const archived = await createProject(team.workspace.id, team.owner.user.id, { state: "archived" });
        await createTask(team.workspace.id, team.owner.user.id, { title: "Paused", projectId: archived.id, assigneeMembershipId: team.member.membership.id });

        const response = await team.member.client.get(`/workspaces/${team.workspace.id}/tasks?assignee=me&due=open`);
        expect(response.body.data.tasks).toEqual([]);
        await expect(team.member.client.get(`/workspaces/${team.workspace.id}/tasks?due=tomorrow`)).resolves.toMatchObject({ status: 400 });
    });
});
