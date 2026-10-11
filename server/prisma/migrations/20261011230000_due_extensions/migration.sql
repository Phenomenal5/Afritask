-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "dueExtensionCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "originalDueAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "DueDateExtension" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "extendedById" UUID,
    "responsibleUserId" UUID,
    "fromDueAt" TIMESTAMPTZ(3) NOT NULL,
    "toDueAt" TIMESTAMPTZ(3) NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DueDateExtension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DueDateExtension_taskId_createdAt_idx" ON "DueDateExtension"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "DueDateExtension_responsibleUserId_createdAt_idx" ON "DueDateExtension"("responsibleUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "DueDateExtension" ADD CONSTRAINT "DueDateExtension_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DueDateExtension" ADD CONSTRAINT "DueDateExtension_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DueDateExtension" ADD CONSTRAINT "DueDateExtension_extendedById_fkey" FOREIGN KEY ("extendedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DueDateExtension" ADD CONSTRAINT "DueDateExtension_responsibleUserId_fkey" FOREIGN KEY ("responsibleUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- NOTE: hand-added. Existing tasks have no extension history, so their current due date is
-- the best record of the original one.
UPDATE "Task" SET "originalDueAt" = "dueAt" WHERE "dueAt" IS NOT NULL AND "originalDueAt" IS NULL;
