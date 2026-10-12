-- Share links can cover a chosen list of workspaces, and can show their names.
-- AlterTable
ALTER TABLE "PerformanceShare" ADD COLUMN     "allWorkspaces" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showWorkspaceNames" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PerformanceShareWorkspace" (
    "shareId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,

    CONSTRAINT "PerformanceShareWorkspace_pkey" PRIMARY KEY ("shareId","workspaceId")
);

-- CreateIndex
CREATE INDEX "PerformanceShareWorkspace_workspaceId_idx" ON "PerformanceShareWorkspace"("workspaceId");

-- AddForeignKey
ALTER TABLE "PerformanceShareWorkspace" ADD CONSTRAINT "PerformanceShareWorkspace_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "PerformanceShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PerformanceShareWorkspace" ADD CONSTRAINT "PerformanceShareWorkspace_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Links made before this change shared everything; keep it that way.
UPDATE "PerformanceShare" SET "allWorkspaces" = true;
