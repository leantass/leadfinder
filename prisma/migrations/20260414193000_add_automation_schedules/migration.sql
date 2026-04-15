ALTER TABLE "AutomationRun"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN "scheduleId" TEXT;

CREATE TABLE "AutomationSchedule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "query" TEXT NOT NULL DEFAULT '',
    "filter" TEXT NOT NULL DEFAULT 'all',
    "sort" TEXT NOT NULL DEFAULT 'score-desc',
    "page" INTEGER NOT NULL DEFAULT 1,
    "pageSize" INTEGER NOT NULL DEFAULT 20,
    "autoApplySafe" BOOLEAN NOT NULL DEFAULT false,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationSchedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationRun_scheduleId_idx" ON "AutomationRun"("scheduleId");
CREATE INDEX "AutomationSchedule_isEnabled_updatedAt_idx" ON "AutomationSchedule"("isEnabled", "updatedAt");
CREATE INDEX "AutomationSchedule_createdAt_idx" ON "AutomationSchedule"("createdAt");

ALTER TABLE "AutomationRun"
ADD CONSTRAINT "AutomationRun_scheduleId_fkey"
FOREIGN KEY ("scheduleId") REFERENCES "AutomationSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
