-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "previousSecretHash" TEXT,
ADD COLUMN     "rotatedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE UNIQUE INDEX "Session_previousSecretHash_key" ON "Session"("previousSecretHash");
