-- ─── Task model V1 (SRS SR06, PRD FR06 + §9 dates) ─────────────────────
-- Hand-written. `prisma migrate diff` generated a recreate-the-enum script that would cast
-- 'pending' into a type without that value (fails on existing rows) and DROPPED the
-- deadline column with its data. This version renames/extends the enums in place and
-- carries every existing deadline over into dueAt.

-- CreateEnum
CREATE TYPE "DueKind" AS ENUM ('date', 'datetime');

-- Priorities gain Urgent.
ALTER TYPE "TaskPriority" ADD VALUE IF NOT EXISTS 'urgent';

-- Statuses: pending → todo (rename keeps every row), plus the new In Review.
ALTER TYPE "TaskStatus" RENAME VALUE 'pending' TO 'todo';
ALTER TYPE "TaskStatus" ADD VALUE IF NOT EXISTS 'in_review' AFTER 'in_progress';
ALTER TABLE "Task" ALTER COLUMN "status" SET DEFAULT 'todo';

-- New columns
ALTER TABLE "Task"
ADD COLUMN "assigneeMembershipId" UUID,
ADD COLUMN "clientRequestId" TEXT,
ADD COLUMN "completedAt" TIMESTAMPTZ(3),
ADD COLUMN "dueAt" TIMESTAMPTZ(3),
ADD COLUMN "dueKind" "DueKind",
ADD COLUMN "dueTimezone" TEXT,
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- ─── Backfill dueAt from the legacy deadline ─────────────────────
-- Legacy deadlines came from a date picker and were stored as midnight UTC of that date.
-- PRD §9: a date-only deadline means 23:59 on that date in the timezone it was set in —
-- the creator's profile timezone (all accounts are on UTC at this point).
UPDATE "Task" t
SET "dueAt" = (((t."deadline" AT TIME ZONE 'UTC')::date + TIME '23:59') AT TIME ZONE u."timezone"),
    "dueKind" = 'date',
    "dueTimezone" = u."timezone"
FROM "User" u
WHERE u."id" = t."creatorId" AND t."deadline" IS NOT NULL;

-- Completion time of legacy completed tasks is unknown — left NULL on purpose
-- (Database Design §4: "Preserve unknown completion times", never invent dates).

DROP INDEX "Task_deadline_status_idx";
ALTER TABLE "Task" DROP COLUMN "deadline";

-- Indexes
CREATE INDEX "Task_workspaceId_assigneeMembershipId_status_dueAt_idx" ON "Task"("workspaceId", "assigneeMembershipId", "status", "dueAt");
CREATE INDEX "Task_dueAt_status_idx" ON "Task"("dueAt", "status");
CREATE UNIQUE INDEX "Task_workspaceId_clientRequestId_key" ON "Task"("workspaceId", "clientRequestId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeMembershipId_fkey" FOREIGN KEY ("assigneeMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
