// ─── Load test (PRD §11 / SRS quality targets) ─────────────────────
//   npm run test:load
//   LOAD_TASKS=10000 LOAD_CONNECTIONS=50 LOAD_DURATION=30 LOAD_P95_MS=500 npm run test:load
//
// Starts the API in-process against the TEST database (same safety guard as the Jest
// suite — it wipes and seeds that database), seeds one workspace with LOAD_TASKS tasks and
// LOAD_CONNECTIONS signed-in members, then drives the hot paths with autocannon:
//   list tasks (paginated view of the workspace), task detail, and task creation.
// Target from the PRD: p95 < 500 ms at 50 concurrent users with 10,000 tasks.
// autocannon reports p90 and p97.5 (no p95); we gate on p97.5, which is stricter.
//
// NOTE: latency is dominated by the round trip to the database. Run it close to the
// database (CI in the same region, or a local Postgres via docker compose) for numbers
// that mean anything; from a laptop far from Neon this measures the network.
import "../setup/env.js";
import autocannon from "autocannon";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import app from "../../src/app.js";
import prisma from "../../src/config/prisma.js";
import { SESSION_COOKIE_NAME } from "../../src/services/sessionService.js";
import { generateSecureToken, hashSecureToken } from "../../src/utils/secureToken.js";
import { hashPassword } from "../../src/utils/password.js";
import { resetDatabase } from "../helpers/database.js";

const TASK_COUNT = Number(process.env.LOAD_TASKS ?? 2000);
const CONNECTIONS = Number(process.env.LOAD_CONNECTIONS ?? 50);
const DURATION_SECONDS = Number(process.env.LOAD_DURATION ?? 20);
const P95_TARGET_MS = Number(process.env.LOAD_P95_MS ?? 500);

const seed = async () => {
    await resetDatabase();
    const passwordHash = await hashPassword("load-test-pass");
    const users = await prisma.user.createManyAndReturn({
        data: Array.from({ length: CONNECTIONS }, (_unused, index) => ({
            name: `Load User ${index}`,
            email: `load-${index}-${randomUUID().slice(0, 6)}@afritask.invalid`,
            password: passwordHash,
            isVerified: true,
        })),
        select: { id: true },
    });
    const workspace = await prisma.workspace.create({ data: { name: "Load test workspace" } });
    await prisma.membership.createMany({
        data: users.map((user, index) => ({ workspaceId: workspace.id, userId: user.id, role: index === 0 ? "owner" : "member" })),
    });

    // Tasks in batches (createMany keeps it to a few round trips).
    for (let offset = 0; offset < TASK_COUNT; offset += 1000) {
        const batchSize = Math.min(1000, TASK_COUNT - offset);
        await prisma.task.createMany({
            data: Array.from({ length: batchSize }, (_unused, index) => ({
                workspaceId: workspace.id,
                creatorId: users[(offset + index) % users.length]!.id,
                title: `Seeded task ${offset + index}`,
                status: (["todo", "in_progress", "in_review", "completed"] as const)[(offset + index) % 4],
            })),
        });
    }

    const sessionSecrets = users.map(() => generateSecureToken());
    await prisma.session.createMany({
        data: users.map((user, index) => ({ userId: user.id, secretHash: hashSecureToken(sessionSecrets[index]!), expiresAt: new Date(Date.now() + 3600_000) })),
    });
    const sampleTask = await prisma.task.findFirstOrThrow({ where: { workspaceId: workspace.id } });
    return { workspaceId: workspace.id, sessionSecrets, sampleTaskId: sampleTask.id };
};

const main = async () => {
    console.log(`Seeding ${TASK_COUNT} tasks and ${CONNECTIONS} users in the TEST database…`);
    const { workspaceId, sessionSecrets, sampleTaskId } = await seed();

    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    let requestCounter = 0;
    const result = await autocannon({
        url: baseUrl,
        connections: CONNECTIONS,
        duration: DURATION_SECONDS,
        // Each connection is one signed-in member (round-robin over the seeded sessions).
        requests: [
            {
                setupRequest: (request) => {
                    requestCounter += 1;
                    const sessionSecret = sessionSecrets[requestCounter % sessionSecrets.length]!;
                    const scenario = requestCounter % 10;
                    const headers = {
                        cookie: `${SESSION_COOKIE_NAME}=${sessionSecret}`,
                        "x-requested-with": "XMLHttpRequest",
                        "content-type": "application/json",
                    };
                    // 60% list, 30% detail, 10% create — a read-heavy task manager.
                    if (scenario < 6) return { ...request, method: "GET", path: `/api/workspaces/${workspaceId}/tasks?status=todo`, headers };
                    if (scenario < 9) return { ...request, method: "GET", path: `/api/tasks/${sampleTaskId}`, headers };
                    return {
                        ...request,
                        method: "POST",
                        path: `/api/workspaces/${workspaceId}/tasks`,
                        headers,
                        body: JSON.stringify({ title: `Load task ${requestCounter}`, clientRequestId: randomUUID() }),
                    };
                },
            },
        ],
    });

    server.close();
    await resetDatabase();
    await prisma.$disconnect();

    const non2xx = result.non2xx + result.errors + result.timeouts;
    const summary = {
        requests: result.requests.total,
        throughputPerSecond: Math.round(result.requests.average),
        latencyMs: { p50: result.latency.p50, p90: result.latency.p90, p97_5: result.latency.p97_5, p99: result.latency.p99, max: result.latency.max },
        failedRequests: non2xx,
    };
    console.log(JSON.stringify(summary, null, 2));

    const passedLatency = result.latency.p97_5 < P95_TARGET_MS;
    const passedErrors = non2xx === 0;
    console.log(`\nLatency target p95 < ${P95_TARGET_MS} ms (checked at p97.5): ${passedLatency ? "PASS" : "FAIL"}`);
    console.log(`No failed requests: ${passedErrors ? "PASS" : `FAIL (${non2xx})`}`);
    process.exitCode = passedLatency && passedErrors ? 0 : 1;
};

main().catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
});
