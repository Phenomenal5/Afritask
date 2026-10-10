-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('customer', 'operator');

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('superadmin');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "kind" "SessionKind" NOT NULL DEFAULT 'customer',
ADD COLUMN     "mfaVerifiedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "PlatformGrant" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "PlatformRole" NOT NULL DEFAULT 'superadmin',
    "mfaSecretEncrypted" TEXT,
    "mfaEnabledAt" TIMESTAMPTZ(3),
    "mfaLastUsedStep" INTEGER,
    "note" TEXT NOT NULL DEFAULT '',
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PlatformGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditEntry" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" UUID,
    "reason" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformGrant_userId_key" ON "PlatformGrant"("userId");

-- CreateIndex
CREATE INDEX "AdminAuditEntry_createdAt_idx" ON "AdminAuditEntry"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditEntry_targetType_targetId_createdAt_idx" ON "AdminAuditEntry"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditEntry_actorId_createdAt_idx" ON "AdminAuditEntry"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlatformGrant" ADD CONSTRAINT "PlatformGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditEntry" ADD CONSTRAINT "AdminAuditEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The operator audit trail is append-only (SRS SR18): refuse edits at the database level.
-- NOTE: this also blocks deleting a user who has audit entries (ON DELETE SET NULL is an
-- UPDATE) — intended: an operator's history must not disappear with their account.
CREATE FUNCTION "admin_audit_refuse_update"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Admin audit entries are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AdminAuditEntry_no_update" BEFORE UPDATE ON "AdminAuditEntry"
    FOR EACH ROW EXECUTE FUNCTION "admin_audit_refuse_update"();
