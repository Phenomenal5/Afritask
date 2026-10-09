// ─── One-off import: MongoDB (users, tasks) → PostgreSQL ─────────────────────
//
//   npm run db:import-mongo -- --dry-run   # read + validate only, writes nothing
//   npm run db:import-mongo                # import
//   (production: node dist/scripts/importFromMongo.js [--dry-run])
//
// Needs MONGO_URL (source) and DATABASE_URL (target, already migrated with `npm run db:deploy`).
//
// Safe to re-run: every row is upserted on its source Mongo _id (legacyMongoId), so a
// second run updates instead of duplicating, and an interrupted run can simply be restarted.
// Records that can't be mapped cleanly are SKIPPED and listed at the end — never guessed at.
// NOTE: stop the old Mongo-backed server (and its reminder worker) before the final run, or
// writes made during the import are lost. This script never sends email or enqueues jobs.

import { PrismaPg } from "@prisma/adapter-pg";
import { MongoClient, type ObjectId } from "mongodb";
import {
    AuthProvider,
    PrismaClient,
    Role,
    TaskPriority,
    TaskStatus,
} from "../generated/prisma/client.js";

const BATCH_SIZE = 500;
const isDryRun = process.argv.includes("--dry-run");

// ─── Source document shapes (what the Mongoose models wrote) ─────────────────────
interface MongoUser {
    _id: ObjectId;
    name?: string;
    email?: string;
    age?: number | null;
    photo?: string | null;
    password?: string | null;
    role?: string;
    provider?: string;
    providerId?: string | null;
    isVerified?: boolean;
    verifyEmailToken?: string | null;
    verifyEmailExpires?: Date | null;
    resetPasswordToken?: string | null;
    resetPasswordExpires?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
}

interface MongoTask {
    _id: ObjectId;
    user?: ObjectId;
    title?: string;
    description?: string | null;
    status?: string;
    priority?: string;
    deadline?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
}

interface SkippedRecord {
    collection: "users" | "tasks";
    sourceId: string;
    reason: string;
}

const skippedRecords: SkippedRecord[] = [];
const skip = (collection: SkippedRecord["collection"], sourceId: string, reason: string) => {
    skippedRecords.push({ collection, sourceId, reason });
};

// Mongo stored "in progress" (with a space); Postgres enum values can't contain one.
const STATUS_MAP: Record<string, TaskStatus> = {
    pending: TaskStatus.pending,
    "in progress": TaskStatus.in_progress,
    "in-progress": TaskStatus.in_progress,
    completed: TaskStatus.completed,
};

const requireEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set`);
    return value;
};

const enumValue = <T extends string>(allowed: Record<string, T>, value: unknown, fallback: T): T | null => {
    if (value === undefined || value === null) return fallback;
    return (Object.values(allowed) as string[]).includes(value as string) ? (value as T) : null;
};

// ─── Users ─────────────────────
const importUsers = async (mongo: MongoClient, prisma: PrismaClient) => {
    const users = mongo.db().collection<MongoUser>("users");
    const sourceCount = await users.countDocuments();
    let importedCount = 0;

    let batch: MongoUser[] = [];
    const flush = async () => {
        for (const sourceUser of batch) {
            const sourceId = sourceUser._id.toHexString();
            const email = sourceUser.email?.trim();
            const name = sourceUser.name?.trim();
            const role = enumValue(Role, sourceUser.role, Role.user);
            const provider = enumValue(AuthProvider, sourceUser.provider, AuthProvider.local);

            if (!email) { skip("users", sourceId, "missing email"); continue; }
            if (!name) { skip("users", sourceId, `missing name (${email})`); continue; }
            if (!role) { skip("users", sourceId, `unknown role "${sourceUser.role}"`); continue; }
            if (!provider) { skip("users", sourceId, `unknown provider "${sourceUser.provider}"`); continue; }

            // An account that signed up on Postgres in the meantime owns this email now — don't merge identities.
            const emailOwner = await prisma.user.findUnique({
                where: { email },
                select: { legacyMongoId: true },
            });
            if (emailOwner && emailOwner.legacyMongoId !== sourceId) {
                skip("users", sourceId, `email ${email} already belongs to a different Postgres user`);
                continue;
            }

            const age = typeof sourceUser.age === "number" && sourceUser.age >= 0 ? Math.round(sourceUser.age) : null;

            const userData = {
                name,
                email,
                age,
                photo: sourceUser.photo ?? null,
                // bcrypt hash copied as-is — never re-hash a hash.
                password: sourceUser.password ?? null,
                role,
                provider,
                providerId: sourceUser.providerId ?? null,
                isVerified: sourceUser.isVerified ?? false,
                verifyEmailToken: sourceUser.verifyEmailToken ?? null,
                verifyEmailExpires: sourceUser.verifyEmailExpires ?? null,
                resetPasswordToken: sourceUser.resetPasswordToken ?? null,
                resetPasswordExpires: sourceUser.resetPasswordExpires ?? null,
                createdAt: sourceUser.createdAt ?? sourceUser._id.getTimestamp(),
                updatedAt: sourceUser.updatedAt ?? sourceUser.createdAt ?? sourceUser._id.getTimestamp(),
            };

            if (!isDryRun) {
                await prisma.user.upsert({
                    where: { legacyMongoId: sourceId },
                    create: { ...userData, legacyMongoId: sourceId },
                    update: userData,
                });
            }
            importedCount += 1;
        }
        batch = [];
    };

    // Stable _id order + bounded batches keeps memory flat however big the collection is.
    for await (const sourceUser of users.find().sort({ _id: 1 })) {
        batch.push(sourceUser);
        if (batch.length >= BATCH_SIZE) await flush();
    }
    await flush();

    return { sourceCount, importedCount };
};

// ─── Tasks ─────────────────────
const importTasks = async (mongo: MongoClient, prisma: PrismaClient) => {
    const tasks = mongo.db().collection<MongoTask>("tasks");
    const sourceCount = await tasks.countDocuments();
    let importedCount = 0;

    // legacy Mongo user id → new Postgres UUID
    const importedUsers = await prisma.user.findMany({
        where: { legacyMongoId: { not: null } },
        select: { id: true, legacyMongoId: true },
    });
    const userIdByLegacyId = new Map(importedUsers.map((user) => [user.legacyMongoId, user.id]));

    let batch: MongoTask[] = [];
    const flush = async () => {
        for (const sourceTask of batch) {
            const sourceId = sourceTask._id.toHexString();
            const ownerLegacyId = sourceTask.user?.toHexString();
            const ownerId = ownerLegacyId ? userIdByLegacyId.get(ownerLegacyId) : undefined;
            const status = sourceTask.status === undefined ? TaskStatus.pending : STATUS_MAP[sourceTask.status];
            const priority = enumValue(TaskPriority, sourceTask.priority, TaskPriority.medium);

            // In a dry run nothing was written, so owners can't be resolved yet — only check the link exists.
            if (!ownerLegacyId) { skip("tasks", sourceId, "task has no owner"); continue; }
            if (!isDryRun && !ownerId) { skip("tasks", sourceId, `owner ${ownerLegacyId} was not imported`); continue; }
            if (!sourceTask.title) { skip("tasks", sourceId, "missing title"); continue; }
            if (!status) { skip("tasks", sourceId, `unknown status "${sourceTask.status}"`); continue; }
            if (!priority) { skip("tasks", sourceId, `unknown priority "${sourceTask.priority}"`); continue; }

            if (!isDryRun && ownerId) {
                const taskData = {
                    userId: ownerId,
                    title: sourceTask.title,
                    description: sourceTask.description ?? "",
                    status,
                    priority,
                    deadline: sourceTask.deadline ?? null,
                    createdAt: sourceTask.createdAt ?? sourceTask._id.getTimestamp(),
                    updatedAt: sourceTask.updatedAt ?? sourceTask.createdAt ?? sourceTask._id.getTimestamp(),
                };
                await prisma.task.upsert({
                    where: { legacyMongoId: sourceId },
                    create: { ...taskData, legacyMongoId: sourceId },
                    update: taskData,
                });
            }
            importedCount += 1;
        }
        batch = [];
    };

    for await (const sourceTask of tasks.find().sort({ _id: 1 })) {
        batch.push(sourceTask);
        if (batch.length >= BATCH_SIZE) await flush();
    }
    await flush();

    return { sourceCount, importedCount };
};

// ─── Run ─────────────────────
const main = async () => {
    const mongo = new MongoClient(requireEnv("MONGO_URL"));
    const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: requireEnv("DATABASE_URL") }),
    });

    try {
        await mongo.connect();
        console.log(`${isDryRun ? "DRY RUN — nothing will be written. " : ""}Source db: ${mongo.db().databaseName}`);

        const userResult = await importUsers(mongo, prisma);
        const taskResult = await importTasks(mongo, prisma);

        console.log("\n─── Result ───");
        console.log(`users: ${userResult.importedCount}/${userResult.sourceCount} ${isDryRun ? "importable" : "imported"}`);
        console.log(`tasks: ${taskResult.importedCount}/${taskResult.sourceCount} ${isDryRun ? "importable" : "imported"}`);

        if (!isDryRun) {
            // Reconcile: what Postgres actually holds from the import, not just what we sent.
            const [postgresUsers, postgresTasks] = await Promise.all([
                prisma.user.count({ where: { legacyMongoId: { not: null } } }),
                prisma.task.count({ where: { legacyMongoId: { not: null } } }),
            ]);
            console.log(`postgres now holds ${postgresUsers} imported users, ${postgresTasks} imported tasks`);
        }

        if (skippedRecords.length > 0) {
            console.log(`\n${skippedRecords.length} record(s) skipped — resolve each before cutover:`);
            for (const record of skippedRecords) {
                console.log(`  ${record.collection} ${record.sourceId}: ${record.reason}`);
            }
            process.exitCode = 1;
        } else {
            console.log("\nNo records skipped.");
        }
    } finally {
        await mongo.close();
        await prisma.$disconnect();
    }
};

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
