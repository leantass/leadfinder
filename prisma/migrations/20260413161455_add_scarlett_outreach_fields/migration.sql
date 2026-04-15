-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "automationStartedAt" TIMESTAMP(3),
ADD COLUMN     "automationSummary" TEXT,
ADD COLUMN     "businessType" TEXT,
ADD COLUMN     "firstContactAt" TIMESTAMP(3),
ADD COLUMN     "lastContactAt" TIMESTAMP(3),
ADD COLUMN     "offerReason" TEXT,
ADD COLUMN     "outreachChannel" TEXT,
ADD COLUMN     "outreachStatus" TEXT NOT NULL DEFAULT 'pending_review',
ADD COLUMN     "queuedForAutomationAt" TIMESTAMP(3),
ADD COLUMN     "readyForAutomation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "suggestedOffer" TEXT;

-- CreateIndex
CREATE INDEX "Lead_businessType_idx" ON "Lead"("businessType");

-- CreateIndex
CREATE INDEX "Lead_suggestedOffer_idx" ON "Lead"("suggestedOffer");

-- CreateIndex
CREATE INDEX "Lead_outreachStatus_idx" ON "Lead"("outreachStatus");

-- CreateIndex
CREATE INDEX "Lead_readyForAutomation_idx" ON "Lead"("readyForAutomation");

-- CreateIndex
CREATE INDEX "Lead_queuedForAutomationAt_idx" ON "Lead"("queuedForAutomationAt");
