ALTER TABLE "Lead"
ADD COLUMN "websiteType" TEXT NOT NULL DEFAULT 'unknown';

CREATE INDEX "Lead_websiteType_idx" ON "Lead"("websiteType");
