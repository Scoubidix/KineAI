-- CreateEnum
CREATE TYPE "nouveaute_canal" AS ENUM ('NOUVEAUTE', 'NEWS');

-- DropIndex
DROP INDEX "nouveautes_isActive_publishedAt_idx";

-- AlterTable
ALTER TABLE "nouveautes" ADD COLUMN     "canal" "nouveaute_canal" NOT NULL DEFAULT 'NOUVEAUTE';

-- CreateIndex
CREATE INDEX "nouveautes_canal_isActive_publishedAt_idx" ON "nouveautes"("canal", "isActive", "publishedAt");
