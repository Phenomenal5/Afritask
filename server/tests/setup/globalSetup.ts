// ─── Once per test run: bring the test database to the current schema ─────────────────────
// Applies the committed migrations exactly like production does (`prisma migrate deploy`),
// so the run also proves the migration history builds a working database from scratch.
import { execSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { config as loadDotenv } from "dotenv";
import { assertSafeTestDatabase } from "./testDatabase.js";

const MAX_ATTEMPTS = 4;

export default async function globalSetup() {
    loadDotenv({ quiet: true });
    const testDatabaseUrl = assertSafeTestDatabase();

    // NOTE: Neon suspends idle compute; the first connection after a pause can fail with
    // P1001 "Can't reach database server" while it wakes. Retry instead of failing the run.
    for (let attempt = 1; ; attempt += 1) {
        try {
            execSync("npx prisma migrate deploy", {
                stdio: "pipe",
                env: { ...process.env, DATABASE_URL: testDatabaseUrl, DIRECT_DATABASE_URL: testDatabaseUrl },
            });
            return;
        } catch (error) {
            const output = String((error as { stdout?: Buffer }).stdout ?? "") + String((error as { stderr?: Buffer }).stderr ?? "");
            const isWakeUpBlip = /P1001|P1017|closed the connection|ETIMEDOUT|ECONNRESET/.test(output);
            if (!isWakeUpBlip || attempt === MAX_ATTEMPTS) {
                throw new Error(`prisma migrate deploy failed on the test database:\n${output}`);
            }
            await sleep(3000 * attempt);
        }
    }
}
