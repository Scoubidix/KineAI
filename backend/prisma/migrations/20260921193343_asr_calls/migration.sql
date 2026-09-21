/*
  Warnings:

  - You are about to drop the column `processingSeconds` on the `bilan_job_segments` table. All the data in the column will be lost.
  - You are about to drop the column `transcribedAt` on the `bilan_job_segments` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "AsrSource" AS ENUM ('DICTATION_LIVE', 'SESSION');

-- DropIndex
DROP INDEX "bilan_job_segments_createdAt_idx";

-- AlterTable
ALTER TABLE "bilan_job_segments" DROP COLUMN "processingSeconds",
DROP COLUMN "transcribedAt";

-- CreateTable
CREATE TABLE "asr_calls" (
    "id" SERIAL NOT NULL,
    "kineId" INTEGER NOT NULL,
    "source" "AsrSource" NOT NULL,
    "waitSeconds" DOUBLE PRECISION NOT NULL,
    "audioSeconds" DOUBLE PRECISION,
    "processingSeconds" DOUBLE PRECISION,
    "error" VARCHAR(40),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asr_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "asr_calls_createdAt_idx" ON "asr_calls"("createdAt");

-- AddForeignKey
ALTER TABLE "asr_calls" ADD CONSTRAINT "asr_calls_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
