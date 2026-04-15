-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "commercialStatus" TEXT NOT NULL DEFAULT 'new';

-- CreateIndex
CREATE INDEX "Lead_commercialStatus_idx" ON "Lead"("commercialStatus");
