-- Nullable: historical jobs have no reliable execution breakdown.
ALTER TABLE "SearchJob"
ADD COLUMN "foundCount" INTEGER,
ADD COLUMN "createdCount" INTEGER,
ADD COLUMN "duplicateSkippedCount" INTEGER,
ADD COLUMN "possibleDuplicateCount" INTEGER;
