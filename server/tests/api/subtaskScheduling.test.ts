// API: the parent task's assignee controls its subtasks, and timed subtasks fit inside
// their task (window, and total duration).
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createTask, createTeam } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

// A 4-hour task: 09:00 to 13:00 UTC on a future day.
const at = (time: string) => `2031-03-10T${time}:00.000Z`;

const fourHourTask = async (team: Awaited<ReturnType<typeof createTeam>>, assigneeMembershipId: string | null = null) => {
    const task = await createTask(team.workspace.id, team.owner.user.id, { title: "Prepare the launch", assigneeMembershipId });
    await prisma.task.update({ where: { id: task.id }, data: { startAt: new Date(at("09:00")), startKind: "datetime", dueAt: new Date(at("13:00")), dueKind: "datetime" } });
    return prisma.task.findUniqueOrThrow({ where: { id: task.id } });
};

const addSubtask = (team: Awaited<ReturnType<typeof createTeam>>, parentId: string, title: string, startAt?: string, dueAt?: string) =>
    team.owner.client.post(`/tasks/${parentId}/subtasks`, { title, ...(startAt && { startAt }), ...(dueAt && { dueAt }) });

describe("the parent task's assignee", () => {
    it("can edit and delete subtasks they didn't create and aren't assigned to", async () => {
        const team = await createTeam();
        const parent = await createTask(team.workspace.id, team.owner.user.id, { assigneeMembershipId: team.member.membership.id });
        const subtask = (await team.owner.client.post(`/tasks/${parent.id}/subtasks`, { title: "Book the venue" })).body.data.task;

        await expect(team.member.client.put(`/tasks/${subtask.id}`, { title: "Book the bigger venue", version: subtask.version })).resolves.toMatchObject({ status: 200 });
        await expect(team.member.client.patch(`/tasks/${subtask.id}/status`, { status: "in_progress", version: subtask.version + 1 })).resolves.toMatchObject({ status: 200 });
        await expect(team.member.client.delete(`/tasks/${subtask.id}`)).resolves.toMatchObject({ status: 204 });
    });

    it("loses that control once the parent is reassigned", async () => {
        const team = await createTeam();
        const parent = await createTask(team.workspace.id, team.owner.user.id, { assigneeMembershipId: team.admin.membership.id });
        const subtask = (await team.owner.client.post(`/tasks/${parent.id}/subtasks`, { title: "Book the venue" })).body.data.task;
        await expect(team.member.client.put(`/tasks/${subtask.id}`, { title: "Nope", version: subtask.version })).resolves.toMatchObject({ status: 403 });
    });
});

describe("timed subtasks fit inside their task", () => {
    it("keeps the start date of a new subtask (it used to be dropped)", async () => {
        const team = await createTeam();
        const parent = await fourHourTask(team);
        const created = await addSubtask(team, parent.id, "Draft", at("09:00"), at("10:00"));
        expect(created.status).toBe(201);
        expect(created.body.data.task.startAt).toBe(at("09:00"));
    });

    it("refuses a subtask outside the task's window", async () => {
        const team = await createTeam();
        const parent = await fourHourTask(team);
        await expect(addSubtask(team, parent.id, "Too late", at("12:00"), at("14:00"))).resolves.toMatchObject({ status: 400, body: { code: "subtask_outside_task" } });
        await expect(addSubtask(team, parent.id, "Too early", at("08:00"), at("10:00"))).resolves.toMatchObject({ status: 400, body: { code: "subtask_outside_task" } });
    });

    it("lets subtasks add up to the task's duration, not beyond", async () => {
        const team = await createTeam();
        const parent = await fourHourTask(team);
        for (const [title, start, end] of [["One", "09:00", "10:00"], ["Two", "10:00", "11:00"], ["Three", "11:00", "12:00"], ["Four", "12:00", "13:00"]]) {
            await expect(addSubtask(team, parent.id, title!, at(start!), at(end!))).resolves.toMatchObject({ status: 201 });
        }
        const fifth = await addSubtask(team, parent.id, "Five", at("09:00"), at("09:30"));
        expect(fifth).toMatchObject({ status: 400, body: { code: "subtasks_exceed_task" } });
        expect(fifth.body.message).toContain("4 h");
        expect(fifth.body.message).toContain("4 h 30 min");
    });

    it("stays flexible: untimed subtasks, or a task without times, aren't limited", async () => {
        const team = await createTeam();
        const timedParent = await fourHourTask(team);
        await expect(addSubtask(team, timedParent.id, "Whenever")).resolves.toMatchObject({ status: 201 });
        const untimedParent = await createTask(team.workspace.id, team.owner.user.id);
        await expect(addSubtask(team, untimedParent.id, "Long one", at("01:00"), at("23:00"))).resolves.toMatchObject({ status: 201 });
    });

    it("refuses moving a subtask out of its task, and shrinking a task below its subtasks", async () => {
        const team = await createTeam();
        const parent = await fourHourTask(team);
        const subtask = (await addSubtask(team, parent.id, "Rehearse", at("11:00"), at("13:00"))).body.data.task;

        await expect(team.owner.client.put(`/tasks/${subtask.id}`, { dueAt: at("15:00"), version: subtask.version })).resolves.toMatchObject({ status: 400, body: { code: "subtask_outside_task" } });

        const shrink = await team.owner.client.put(`/tasks/${parent.id}`, { dueAt: at("12:00"), version: parent.version });
        expect(shrink).toMatchObject({ status: 400, body: { code: "subtask_outside_task" } });
        expect(shrink.body.message).toContain("Rehearse");
    });
});
