// API: board moves (SRS SR12 acceptance). A board move is the status PATCH — the same call
// the list's status menu makes — so both views share one rule set.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createProject, createTask, createTeam } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

describe("board moves", () => {
    it("a move by someone without permission is rejected and leaves no trace", async () => {
        const team = await createTeam();
        // Created by the Owner, assigned to the Admin: the Member has no edit right.
        const task = await createTask(team.workspace.id, team.owner.user.id, { assigneeMembershipId: team.admin.membership.id });

        const move = await team.member.client.patch(`/tasks/${task.id}/status`, { status: "in_progress", version: 1 });
        expect(move.status).toBe(403);
        await expect(prisma.task.findUniqueOrThrow({ where: { id: task.id } })).resolves.toMatchObject({ status: "todo", version: 1 });
        await expect(prisma.activity.count({ where: { entityId: task.id } })).resolves.toBe(0);
    });

    it("a successful move shows in the list and in the task's history", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id, { title: "Card", assigneeMembershipId: team.member.membership.id });

        const move = await team.member.client.patch(`/tasks/${task.id}/status`, { status: "in_review", version: 1 });
        expect(move.status).toBe(200);

        const inReview = await team.owner.client.get(`/workspaces/${team.workspace.id}/tasks?status=in_review`);
        expect(inReview.body.data.tasks.map((listed: { title: string }) => listed.title)).toEqual(["Card"]);
        const history = await team.owner.client.get(`/tasks/${task.id}/activity`);
        expect(history.body.data.entries[0]).toMatchObject({ actor: { name: "Musa Member" }, changes: { status: { from: "todo", to: "in_review" } } });
    });

    it("a move based on a stale card is refused, so the client can restore it", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);
        await team.owner.client.patch(`/tasks/${task.id}/status`, { status: "in_progress", version: 1 });

        const staleMove = await team.owner.client.patch(`/tasks/${task.id}/status`, { status: "completed", version: 1 });
        expect(staleMove.status).toBe(409);
        await expect(prisma.task.findUniqueOrThrow({ where: { id: task.id } })).resolves.toMatchObject({ status: "in_progress" });
    });

    it("cards in archived projects can't move", async () => {
        const team = await createTeam();
        const archived = await createProject(team.workspace.id, team.owner.user.id, { state: "archived" });
        const task = await createTask(team.workspace.id, team.owner.user.id, { projectId: archived.id });

        await expect(team.owner.client.patch(`/tasks/${task.id}/status`, { status: "completed", version: 1 })).resolves.toMatchObject({ status: 409 });
    });
});
