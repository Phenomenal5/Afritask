// API: "what was done" — a note is required to complete a top-level task (optional for
// subtasks), cleared on reopen, and kept in the task's history.
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createTask, createTeam } from "../helpers/factories.js";

beforeEach(resetDatabase);
afterAll(disconnectDatabase);

describe("completing a task", () => {
    it("requires a note, in every way a task can be completed", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);

        for (const note of [undefined, "", "   "]) {
            const response = await team.owner.client.patch(`/tasks/${task.id}/status`, { status: "completed", completionNote: note, version: task.version });
            expect(response.status).toBe(400);
            expect(response.body.code).toBe("completion_note_required");
        }
        await expect(team.owner.client.put(`/tasks/${task.id}`, { status: "completed", version: task.version })).resolves.toMatchObject({ status: 400, body: { code: "completion_note_required" } });
        await expect(team.owner.client.post(`/workspaces/${team.workspace.id}/tasks`, { title: "Already done", status: "completed" })).resolves.toMatchObject({ status: 400 });

        // Nothing changed.
        await expect(prisma.task.findUniqueOrThrow({ where: { id: task.id } })).resolves.toMatchObject({ status: "todo", completionNote: null, version: task.version });
    });

    it("stores the note, shows it in history, and clears it on reopen (history keeps it)", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);

        const completed = await team.owner.client.patch(`/tasks/${task.id}/status`, { status: "completed", completionNote: "  Sent the final invoice to the client.  ", version: task.version });
        expect(completed.status).toBe(200);
        expect(completed.body.data.task).toMatchObject({ status: "completed", completionNote: "Sent the final invoice to the client." });

        const reopened = await team.owner.client.patch(`/tasks/${task.id}/status`, { status: "in_progress", version: task.version + 1 });
        expect(reopened.body.data.task).toMatchObject({ status: "in_progress", completionNote: null, completedAt: null });

        const history = await team.owner.client.get(`/tasks/${task.id}/activity`);
        const [reopenEntry, completeEntry] = history.body.data.entries;
        expect(completeEntry.changes.completionNote).toEqual({ from: null, to: "Sent the final invoice to the client." });
        expect(reopenEntry.changes.completionNote).toEqual({ from: "Sent the final invoice to the client.", to: null });
    });

    it("lets the note be corrected while the task stays completed, but not emptied", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);
        await team.owner.client.patch(`/tasks/${task.id}/status`, { status: "completed", completionNote: "Fixed it", version: task.version });

        const corrected = await team.owner.client.put(`/tasks/${task.id}`, { completionNote: "Fixed the login bug and added a test", version: task.version + 1 });
        expect(corrected.body.data.task.completionNote).toBe("Fixed the login bug and added a test");
        await expect(team.owner.client.put(`/tasks/${task.id}`, { completionNote: "", version: task.version + 2 })).resolves.toMatchObject({ status: 400 });
    });

    it("keeps subtasks quick: their note is optional", async () => {
        const team = await createTeam();
        const parent = await createTask(team.workspace.id, team.owner.user.id);
        const subtask = await team.owner.client.post(`/tasks/${parent.id}/subtasks`, { title: "Book the venue" });

        const ticked = await team.owner.client.patch(`/tasks/${subtask.body.data.task.id}/status`, { status: "completed", version: subtask.body.data.task.version });
        expect(ticked.status).toBe(200);
        expect(ticked.body.data.task.completionNote).toBeNull();
    });

    it("rejects an oversized or non-text note", async () => {
        const team = await createTeam();
        const task = await createTask(team.workspace.id, team.owner.user.id);
        await expect(team.owner.client.patch(`/tasks/${task.id}/status`, { status: "completed", completionNote: "x".repeat(2001), version: task.version })).resolves.toMatchObject({ status: 400 });
        await expect(team.owner.client.patch(`/tasks/${task.id}/status`, { status: "completed", completionNote: { not: "" }, version: task.version })).resolves.toMatchObject({ status: 400 });
    });
});
