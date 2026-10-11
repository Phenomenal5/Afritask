-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'task_starting';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "startAt" TIMESTAMPTZ(3),
ADD COLUMN     "startKind" "DueKind",
ADD COLUMN     "startReminderAt" TIMESTAMPTZ(3),
ADD COLUMN     "startTimezone" TEXT;

-- CreateIndex
CREATE INDEX "Task_startReminderAt_idx" ON "Task"("startReminderAt");

