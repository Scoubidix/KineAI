-- AlterTable
ALTER TABLE "bilan_job_segments" ADD COLUMN     "processingSeconds" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "bilan_job_segments_createdAt_idx" ON "bilan_job_segments"("createdAt");
