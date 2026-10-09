-- ─── Workspaces + memberships (SRS SR02) ─────────────────────
-- Hand-edited from `prisma migrate diff` output. The generated version DROPPED Task.userId
-- and re-added empty NOT NULL columns, which would fail on (or wipe) existing tasks.
-- This one renames the column and backfills a personal workspace for every existing user,
-- following the Database Design doc §4 "Legacy workspace creation".

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'removed');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Membership_userId_status_idx" ON "Membership"("userId", "status");
CREATE UNIQUE INDEX "Membership_workspaceId_userId_key" ON "Membership"("workspaceId", "userId");
CREATE UNIQUE INDEX "Membership_one_active_owner" ON "Membership"("workspaceId") WHERE (role = 'owner' AND status = 'active');

ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Task.userId → Task.creatorId (rename keeps the data) ─────────────────────
ALTER TABLE "Task" DROP CONSTRAINT "Task_userId_fkey";
DROP INDEX "Task_userId_createdAt_idx";
ALTER TABLE "Task" RENAME COLUMN "userId" TO "creatorId";
ALTER TABLE "Task" ADD COLUMN "workspaceId" UUID;

-- ─── Backfill: one personal workspace per existing user, them as Owner ─────────────────────
CREATE TEMP TABLE "_personal_workspace" AS
SELECT "id" AS "userId", gen_random_uuid() AS "workspaceId", "name", "createdAt"
FROM "User";

INSERT INTO "Workspace" ("id", "name", "createdAt", "updatedAt")
SELECT "workspaceId", split_part(trim("name"), ' ', 1) || '''s workspace', "createdAt", CURRENT_TIMESTAMP
FROM "_personal_workspace";

INSERT INTO "Membership" ("id", "workspaceId", "userId", "role", "joinedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "workspaceId", "userId", 'owner', "createdAt", "createdAt", CURRENT_TIMESTAMP
FROM "_personal_workspace";

UPDATE "Task" SET "workspaceId" = p."workspaceId"
FROM "_personal_workspace" p
WHERE "Task"."creatorId" = p."userId";

ALTER TABLE "Task" ALTER COLUMN "workspaceId" SET NOT NULL;
DROP TABLE "_personal_workspace";

-- ─── Task constraints ─────────────────────
CREATE INDEX "Task_workspaceId_createdAt_idx" ON "Task"("workspaceId", "createdAt");
CREATE INDEX "Task_creatorId_idx" ON "Task"("creatorId");

ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- RESTRICT: deleting a user must never silently delete shared work.
ALTER TABLE "Task" ADD CONSTRAINT "Task_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
