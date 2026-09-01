-- CreateEnum
CREATE TYPE "LeadOrigin" AS ENUM ('SEARCH', 'MANUAL');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "origin" "LeadOrigin" NOT NULL DEFAULT 'SEARCH',
ALTER COLUMN "searchJobId" DROP NOT NULL,
ALTER COLUMN "sourcePlatform" DROP NOT NULL;
