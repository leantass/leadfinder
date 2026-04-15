-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "scoreReasons" TEXT[] DEFAULT ARRAY[]::TEXT[];
