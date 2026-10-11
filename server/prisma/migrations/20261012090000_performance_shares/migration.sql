-- CreateTable
CREATE TABLE "PerformanceShare" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PerformanceShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PerformanceShare_tokenHash_key" ON "PerformanceShare"("tokenHash");

-- CreateIndex
CREATE INDEX "PerformanceShare_userId_createdAt_idx" ON "PerformanceShare"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "PerformanceShare" ADD CONSTRAINT "PerformanceShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

