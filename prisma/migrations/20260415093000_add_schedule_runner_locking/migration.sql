ALTER TABLE "AutomationRun"
ADD COLUMN "executionKey" TEXT;

ALTER TABLE "AutomationSchedule"
ADD COLUMN "lockedAt" TIMESTAMP(3);

ALTER TABLE "AutomationSchedulerExecution"
ADD COLUMN "skippedLocked" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "skippedDuplicate" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "AutomationRun_executionKey_key" ON "AutomationRun"("executionKey");
