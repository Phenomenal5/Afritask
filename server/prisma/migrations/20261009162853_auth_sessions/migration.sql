-- CreateEnum
CREATE TYPE "AccountTokenPurpose" AS ENUM ('verify_email', 'reset_password', 'oauth_exchange');

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "secretHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "AccountTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_secretHash_key" ON "Session"("secretHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountToken_tokenHash_key" ON "AccountToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AccountToken_userId_purpose_idx" ON "AccountToken"("userId", "purpose");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountToken" ADD CONSTRAINT "AccountToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Carry outstanding links over (hand-written) ─────────────────────
-- NOTE: pending verify/reset links already sitting in people's inboxes must keep working.
-- Store each raw token as its SHA-256 hex — the same hash utils/secureToken.ts computes —
-- BEFORE the old plaintext columns are dropped below.
INSERT INTO "AccountToken" ("id", "userId", "purpose", "tokenHash", "expiresAt")
SELECT gen_random_uuid(), "id", 'verify_email', encode(sha256(convert_to("verifyEmailToken", 'UTF8')), 'hex'),
       COALESCE("verifyEmailExpires", CURRENT_TIMESTAMP)
FROM "User" WHERE "verifyEmailToken" IS NOT NULL;

INSERT INTO "AccountToken" ("id", "userId", "purpose", "tokenHash", "expiresAt")
SELECT gen_random_uuid(), "id", 'reset_password', encode(sha256(convert_to("resetPasswordToken", 'UTF8')), 'hex'),
       COALESCE("resetPasswordExpires", CURRENT_TIMESTAMP)
FROM "User" WHERE "resetPasswordToken" IS NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "resetPasswordExpires",
DROP COLUMN "resetPasswordToken",
DROP COLUMN "verifyEmailExpires",
DROP COLUMN "verifyEmailToken",
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';
