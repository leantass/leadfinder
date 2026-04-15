ALTER TABLE "AutomationSchedule"
ADD COLUMN "autoApplyMinConfidence" TEXT NOT NULL DEFAULT 'high',
ADD COLUMN "autoApplyActions" TEXT[] NOT NULL DEFAULT ARRAY['contact_now', 'follow_up', 'send_to_sales']::TEXT[];
