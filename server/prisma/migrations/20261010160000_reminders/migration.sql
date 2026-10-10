-- CreateEnum
CREATE TYPE "ReminderOffset" AS ENUM ('at_due', 'one_hour', 'one_day', 'three_days', 'one_week');

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM ('pending', 'sent', 'failed', 'suppressed');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'task_reminder';
ALTER TYPE "NotificationType" ADD VALUE 'task_overdue';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "overdueCheckAt" TIMESTAMPTZ(3),
ADD COLUMN     "remindAt" TIMESTAMPTZ(3),
ADD COLUMN     "reminderOffset" "ReminderOffset";

-- CreateTable
CREATE TABLE "EmailDelivery" (
    "id" UUID NOT NULL,
    "deliveryKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recipientId" UUID NOT NULL,
    "taskId" UUID,
    "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDelivery_deliveryKey_key" ON "EmailDelivery"("deliveryKey");

-- CreateIndex
CREATE INDEX "EmailDelivery_status_updatedAt_idx" ON "EmailDelivery"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Task_remindAt_idx" ON "Task"("remindAt");

-- CreateIndex
CREATE INDEX "Task_overdueCheckAt_idx" ON "Task"("overdueCheckAt");

-- AddForeignKey
ALTER TABLE "EmailDelivery" ADD CONSTRAINT "EmailDelivery_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── Backfill (hand-written) ─────────────────────
-- Existing tasks with a deadline keep the behaviour the old daily "due tomorrow" email gave
-- them: a reminder one day before. Date-only deadlines anchor at 09:00 local time.
UPDATE "Task" SET "reminderOffset" = 'one_day' WHERE "dueAt" IS NOT NULL;

-- Schedule only open tasks outside archived projects, and only FUTURE instants — nothing
-- already past fires when this deploys.
UPDATE "Task" AS t
SET "remindAt" = CASE
        WHEN t."dueKind" = 'date' THEN
            ((((t."dueAt" AT TIME ZONE COALESCE(t."dueTimezone", 'UTC'))::date - 1) + TIME '09:00') AT TIME ZONE COALESCE(t."dueTimezone", 'UTC'))
        ELSE t."dueAt" - INTERVAL '1 day'
    END,
    "overdueCheckAt" = t."dueAt"
WHERE t."dueAt" IS NOT NULL
  AND t."status" <> 'completed'
  AND NOT EXISTS (SELECT 1 FROM "Project" AS p WHERE p."id" = t."projectId" AND p."state" = 'archived');

UPDATE "Task" SET "remindAt" = NULL WHERE "remindAt" <= now();
UPDATE "Task" SET "overdueCheckAt" = NULL WHERE "overdueCheckAt" <= now();
