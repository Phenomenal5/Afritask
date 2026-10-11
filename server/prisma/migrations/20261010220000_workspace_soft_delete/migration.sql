-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "deletedById" UUID;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

