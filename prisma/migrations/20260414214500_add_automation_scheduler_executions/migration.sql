CREATE TABLE "AutomationSchedulerExecution" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "schedulesChecked" INTEGER NOT NULL DEFAULT 0,
    "schedulesRun" INTEGER NOT NULL DEFAULT 0,
    "runsCreated" INTEGER NOT NULL DEFAULT 0,
    "safeActionsApplied" INTEGER NOT NULL DEFAULT 0,
    "errorSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AutomationSchedulerExecution_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AutomationSchedulerExecution_createdAt_idx" ON "AutomationSchedulerExecution"("createdAt");
CREATE INDEX "AutomationSchedulerExecution_status_createdAt_idx" ON "AutomationSchedulerExecution"("status", "createdAt");
