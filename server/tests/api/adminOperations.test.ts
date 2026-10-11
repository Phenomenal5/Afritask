// API: admin operations — health, delivery failures with retry, the audit trail (SRS SR18).
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import { disconnectDatabase, prisma, resetDatabase } from "../helpers/database.js";
import { createTask, createTeam } from "../helpers/factories.js";
import { createSignedInUser } from "../helpers/factories.js";
import { createOperatorClient } from "../helpers/operator.js";
import { clearMailbox, emailsTo } from "../helpers/mailbox.js";
import { closeHealthConnections } from "../../src/controllers/health.controller.js";

beforeEach(async () => {
    await resetDatabase();
    clearMailbox();
});
afterAll(async () => {
    await closeHealthConnections();
    await disconnectDatabase();
});

const REASON = { reason: "Provider outage resolved" };

// A failed reminder email for a task that's still open and assigned.
const failedDelivery = async () => {
    const team = await createTeam();
    const task = await createTask(team.workspace.id, team.owner.user.id, {
        assigneeMembershipId: team.member.membership.id,
        dueAt: new Date(Date.now() + 86_400_000),
    });
    const delivery = await prisma.emailDelivery.create({
        data: {
            deliveryKey: `task_reminder:${task.id}:test:${team.member.user.id}`,
            kind: "task_reminder",
            recipientId: team.member.user.id,
            taskId: task.id,
            status: "failed",
            attempts: 3,
            lastError: "Simulated provider failure",
        },
    });
    return { team, task, delivery };
};

describe("health", () => {
    it("reports dependencies and delivery counts, never secrets", async () => {
        const { client } = await createOperatorClient();
        await failedDelivery();

        const response = await client.get("/operations/health");
        expect(response.status).toBe(200);
        expect(response.body.data.checks.database).toMatchObject({ status: "ok" });
        expect(response.body.data.deliveries).toEqual({ failed: 1, pending: 0 });
        expect(JSON.stringify(response.body)).not.toMatch(/postgres(ql)?:\/\/|redis:\/\/|password/i);
    });

    it("isn't open to customers", async () => {
        const { client } = await createSignedInUser();
        await expect(client.get("/admin/operations/health")).resolves.toMatchObject({ status: 401 });
    });
});

describe("deliveries", () => {
    it("lists failures with the provider error and the task's workspace — no task content", async () => {
        const { client } = await createOperatorClient();
        const { team, delivery } = await failedDelivery();

        const response = await client.get("/deliveries?status=failed");
        expect(response.body.data.items).toMatchObject([
            { id: delivery.id, status: "failed", attempts: 3, lastError: "Simulated provider failure", recipient: { email: team.member.user.email }, workspaceId: team.workspace.id },
        ]);
        expect(JSON.stringify(response.body)).not.toContain("Test task");
        await expect(client.get("/deliveries?status=lost")).resolves.toMatchObject({ status: 400 });
    });

    it("a retry after automatic attempts ran out sends once, is audited, and can't resend", async () => {
        const { user: operator, client } = await createOperatorClient();
        const { team, delivery } = await failedDelivery();

        await expect(client.post(`/deliveries/${delivery.id}/retry`, { reason: "x" })).resolves.toMatchObject({ status: 400 });
        const retried = await client.post(`/deliveries/${delivery.id}/retry`, REASON);
        expect(retried.body.data).toMatchObject({ outcome: "sent", delivery: { status: "sent", attempts: 4 } });
        expect(emailsTo(team.member.user.email)).toHaveLength(1);

        await expect(prisma.adminAuditEntry.findFirst({ where: { action: "delivery.retried" } })).resolves.toMatchObject({ actorId: operator.id, targetId: delivery.id });
        // Known-successful emails are never sent again.
        await expect(client.post(`/deliveries/${delivery.id}/retry`, REASON)).resolves.toMatchObject({ status: 409 });
        expect(emailsTo(team.member.user.email)).toHaveLength(1);
    });

    it("a retry for finished work is suppressed, not sent", async () => {
        const { client } = await createOperatorClient();
        const { team, task, delivery } = await failedDelivery();
        await prisma.task.update({ where: { id: task.id }, data: { status: "completed" } });

        const retried = await client.post(`/deliveries/${delivery.id}/retry`, REASON);
        expect(retried.body.data).toMatchObject({ outcome: "suppressed", delivery: { status: "suppressed" } });
        expect(emailsTo(team.member.user.email)).toHaveLength(0);
    });
});

describe("audit trail", () => {
    it("lists operator actions newest first, filterable, with who and why", async () => {
        const { user: operator, client } = await createOperatorClient();
        const team = await createTeam();
        await client.post(`/accounts/${team.member.user.id}/suspend`, { reason: "Spam reports" });
        await client.post(`/accounts/${team.member.user.id}/restore`, { reason: "Appeal accepted" });

        const all = await client.get("/audit");
        expect(all.body.data.items.slice(0, 2)).toMatchObject([
            { action: "account.restored", reason: "Appeal accepted", actor: { id: operator.id } },
            { action: "account.suspended", reason: "Spam reports" },
        ]);
        const filtered = await client.get("/audit?action=account.suspended");
        expect(filtered.body.data.items).toHaveLength(1);
        const byTarget = await client.get(`/audit?targetId=${team.member.user.id}`);
        expect(byTarget.body.data.pagination.total).toBe(2);
    });
});
