ALTER TABLE "Lead"
ADD COLUMN "followUpNextAction" TEXT,
ADD COLUMN "followUpDueAt" TIMESTAMP(3);

CREATE INDEX "Lead_followUpDueAt_idx" ON "Lead"("followUpDueAt");

CREATE TABLE "LeadActivity" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadActivity_leadId_idx" ON "LeadActivity"("leadId");
CREATE INDEX "LeadActivity_createdAt_idx" ON "LeadActivity"("createdAt");
CREATE INDEX "LeadActivity_type_idx" ON "LeadActivity"("type");

ALTER TABLE "LeadActivity"
ADD CONSTRAINT "LeadActivity_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
