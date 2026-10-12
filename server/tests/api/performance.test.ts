// API: the monthly performance summary (counts per month in the person's timezone) and its
// share links (public, counts only, revocable).
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { anonymous } from "../helpers/client.js";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createTeam } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

const at = (isoInstant: string) => new Date(isoInstant);

// September 2026 for Musa (the team member, timezone UTC), built straight in the database
// so every number below is known.
const buildSeptember = async () => {
    const team = await createTeam();
    const workspaceId = team.workspace.id;
    const musa = team.member;
    const mine = { workspaceId, creatorId: musa.user.id, assigneeMembershipId: musa.membership.id, status: "completed" as const };

    await prisma.task.createMany({
        data: [
            // On time, never extended.
            { ...mine, title: "A", dueAt: at("2026-09-10T17:00:00Z"), originalDueAt: at("2026-09-10T17:00:00Z"), completedAt: at("2026-09-09T12:00:00Z"), createdAt: at("2026-09-01T09:00:00Z") },
            // Late.
            { ...mine, title: "B", dueAt: at("2026-09-10T17:00:00Z"), originalDueAt: at("2026-09-10T17:00:00Z"), completedAt: at("2026-09-12T12:00:00Z"), createdAt: at("2026-09-01T09:30:00Z") },
            // On time, but only after an extension.
            { ...mine, title: "C", dueAt: at("2026-09-20T17:00:00Z"), originalDueAt: at("2026-09-14T17:00:00Z"), dueExtensionCount: 1, completedAt: at("2026-09-15T12:00:00Z"), createdAt: at("2026-09-03T09:00:00Z") },
            // No deadline; not planned ahead.
            { ...mine, title: "D", completedAt: at("2026-09-05T12:00:00Z"), createdAt: at("2026-09-03T10:00:00Z") },
            // Completed in August — not September's.
            { ...mine, title: "E", dueAt: at("2026-08-31T17:00:00Z"), completedAt: at("2026-08-30T12:00:00Z"), createdAt: at("2026-08-20T09:00:00Z") },
            // Someone else's task — not Musa's numbers.
            { workspaceId, creatorId: team.owner.user.id, assigneeMembershipId: team.owner.membership.id, status: "completed", title: "F", completedAt: at("2026-09-09T12:00:00Z") },
        ],
    });
    const taskC = await prisma.task.findFirstOrThrow({ where: { title: "C" } });
    await prisma.dueDateExtension.createMany({
        data: [
            { taskId: taskC.id, workspaceId, extendedById: musa.user.id, responsibleUserId: musa.user.id, fromDueAt: at("2026-09-14T17:00:00Z"), toDueAt: at("2026-09-20T17:00:00Z"), createdAt: at("2026-09-13T08:00:00Z") },
            // August's extension doesn't count in September.
            { taskId: taskC.id, workspaceId, extendedById: musa.user.id, responsibleUserId: musa.user.id, fromDueAt: at("2026-08-01T17:00:00Z"), toDueAt: at("2026-08-02T17:00:00Z"), createdAt: at("2026-08-15T08:00:00Z") },
        ],
    });
    const activity = (action: string, createdAt: string) => ({ workspaceId, actorId: musa.user.id, entityType: "task", entityId: randomUUID(), action, createdAt: at(createdAt) });
    await prisma.activity.createMany({
        data: [
            // Two planning days: Sept 1 (twice) and Sept 3. A comment isn't planning.
            activity("task.created", "2026-09-01T09:00:00Z"),
            activity("task.updated", "2026-09-01T15:00:00Z"),
            activity("task.updated", "2026-09-03T09:00:00Z"),
            activity("comment.created", "2026-09-07T09:00:00Z"),
        ],
    });
    return team;
};

describe("GET /performance", () => {
    it("summarises the month", async () => {
        const team = await buildSeptember();
        const response = await team.member.client.get("/performance?month=2026-09");
        expect(response.status).toBe(200);
        expect(response.body.data.summary).toEqual({
            month: "2026-09",
            timezone: "UTC",
            completed: 4,
            completedOnTime: 2,
            completedLate: 1,
            completedWithoutDeadline: 1,
            metWithoutExtending: 1,
            onTimeAfterExtending: 1,
            onTimeRate: 0.667,
            extensions: 1,
            planningDays: 2,
            daysInMonth: 30,
            tasksCreated: 4,
            plannedAhead: 3,
            plannedAheadRate: 0.75,
            // B (late) and C (finished after its first deadline, within the extended one).
            completedAfterOriginalDue: 2,
            subtasksCompleted: 0,
            projectsCreated: 0,
            commentsWritten: 0,
        });
    });

    it("gives a six-month trend ending at that month", async () => {
        const team = await buildSeptember();
        const response = await team.member.client.get("/performance?month=2026-09");
        const trend = response.body.data.trend;
        expect(trend.map((point: { month: string }) => point.month)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"]);
        expect(trend[4]).toEqual({ month: "2026-08", completedOnTime: 1, completedLate: 0, extensions: 1, planningDays: 0 });
        expect(trend[5]).toMatchObject({ completedOnTime: 2, completedLate: 1, extensions: 1, planningDays: 2 });
    });

    it("uses the person's timezone for month edges", async () => {
        const team = await buildSeptember();
        // Task A was completed 2026-09-09 12:00 UTC — still September in Lagos, but an
        // 2026-08-31 23:30 UTC completion is September 1 in Lagos (UTC+1).
        await prisma.task.create({
            data: { workspaceId: team.workspace.id, creatorId: team.member.user.id, assigneeMembershipId: team.member.membership.id, status: "completed", title: "Late night", completedAt: at("2026-08-31T23:30:00Z") },
        });
        await prisma.user.update({ where: { id: team.member.user.id }, data: { timezone: "Africa/Lagos" } });
        const response = await team.member.client.get("/performance?month=2026-09");
        expect(response.body.data.summary).toMatchObject({ timezone: "Africa/Lagos", completed: 5, completedWithoutDeadline: 2 });
    });

    it("rejects a malformed month and requires sign-in", async () => {
        const team = await createTeam();
        await expect(team.member.client.get("/performance?month=2026-13")).resolves.toMatchObject({ status: 400 });
        await expect(anonymous().get("/api/v1/performance")).resolves.toMatchObject({ status: 401 });
    });
});

describe("share links", () => {
    it("shares a month publicly (counts only) until revoked", async () => {
        const team = await buildSeptember();
        const created = await team.member.client.post("/performance/shares", { month: "2026-09", workspaceIds: [team.workspace.id] });
        expect(created.status).toBe(201);
        const { id, token } = created.body.data.share;
        expect(token).toMatch(/^[0-9a-f]{64}$/);

        // Only the hash is stored.
        const stored = await prisma.performanceShare.findUniqueOrThrow({ where: { id } });
        expect(stored.tokenHash).not.toBe(token);

        const shared = await anonymous().get(`/api/v1/performance/shared/${token}`);
        expect(shared.status).toBe(200);
        expect(shared.body.data.owner).toEqual({ name: "Musa Member", photo: null });
        expect(shared.body.data.summary).toMatchObject({ month: "2026-09", completed: 4, metWithoutExtending: 1 });
        // No task content anywhere.
        expect(JSON.stringify(shared.body)).not.toMatch(/"title"|"A"|"B"/);

        await expect(team.member.client.get("/performance/shares")).resolves.toMatchObject({ body: { data: { shares: [{ id, month: "2026-09" }] } } });
        await expect(team.member.client.delete(`/performance/shares/${id}`)).resolves.toMatchObject({ status: 204 });
        await expect(anonymous().get(`/api/v1/performance/shared/${token}`)).resolves.toMatchObject({ status: 404 });
    });

    it("can't revoke someone else's link; unknown tokens are 404", async () => {
        const team = await buildSeptember();
        const created = await team.member.client.post("/performance/shares", { month: "2026-09", workspaceIds: [team.workspace.id] });
        await expect(team.owner.client.delete(`/performance/shares/${created.body.data.share.id}`)).resolves.toMatchObject({ status: 404 });
        await expect(anonymous().get(`/api/v1/performance/shared/${"0".repeat(64)}`)).resolves.toMatchObject({ status: 404 });
    });

    it("a suspended account's links stop working", async () => {
        const team = await buildSeptember();
        const created = await team.member.client.post("/performance/shares", { month: "2026-09", workspaceIds: [team.workspace.id] });
        await prisma.user.update({ where: { id: team.member.user.id }, data: { suspendedAt: new Date() } });
        await expect(anonymous().get(`/api/v1/performance/shared/${created.body.data.share.token}`)).resolves.toMatchObject({ status: 404 });
    });
});
