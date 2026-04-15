CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL DEFAULT '',
    "filter" TEXT NOT NULL DEFAULT 'all',
    "sort" TEXT NOT NULL DEFAULT 'score-desc',
    "page" INTEGER NOT NULL DEFAULT 1,
    "pageSize" INTEGER NOT NULL DEFAULT 20,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "analyzedCount" INTEGER NOT NULL DEFAULT 0,
    "decisionCount" INTEGER NOT NULL DEFAULT 0,
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationRunItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "suggestedStatus" TEXT,
    "suggestedChannel" TEXT,
    "suggestedMessagePreview" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "AutomationRunItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationRun_createdAt_idx" ON "AutomationRun"("createdAt");
CREATE INDEX "AutomationRun_status_createdAt_idx" ON "AutomationRun"("status", "createdAt");
CREATE INDEX "AutomationRunItem_runId_idx" ON "AutomationRunItem"("runId");
CREATE INDEX "AutomationRunItem_runId_status_idx" ON "AutomationRunItem"("runId", "status");
CREATE INDEX "AutomationRunItem_leadId_idx" ON "AutomationRunItem"("leadId");
CREATE INDEX "AutomationRunItem_createdAt_idx" ON "AutomationRunItem"("createdAt");

ALTER TABLE "AutomationRunItem"
ADD CONSTRAINT "AutomationRunItem_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationRunItem"
ADD CONSTRAINT "AutomationRunItem_leadId_fkey"
FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
