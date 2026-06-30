-- CreateTable
CREATE TABLE "ClientSourceSettings" (
    "branchId" TEXT NOT NULL,
    "sourcesJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientSourceSettings_pkey" PRIMARY KEY ("branchId")
);

-- AddForeignKey
ALTER TABLE "ClientSourceSettings"
ADD CONSTRAINT "ClientSourceSettings_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
