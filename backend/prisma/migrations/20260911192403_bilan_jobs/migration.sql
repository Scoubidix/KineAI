-- CreateEnum
CREATE TYPE "BilanJobKind" AS ENUM ('DICTATION', 'SESSION');

-- CreateEnum
CREATE TYPE "BilanJobStatus" AS ENUM ('RECORDING', 'TRANSCRIBING', 'CORRECTING', 'COMPOSING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "BilanJobSegmentStatus" AS ENUM ('QUEUED', 'DONE', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "bilan_jobs" (
    "id" SERIAL NOT NULL,
    "bilanId" INTEGER NOT NULL,
    "kineId" INTEGER NOT NULL,
    "kind" "BilanJobKind" NOT NULL DEFAULT 'DICTATION',
    "status" "BilanJobStatus" NOT NULL DEFAULT 'RECORDING',
    "segmentsTotal" INTEGER,
    "error" VARCHAR(40),
    "errorDetail" JSONB,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "bilan_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bilan_job_segments" (
    "id" SERIAL NOT NULL,
    "jobId" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "status" "BilanJobSegmentStatus" NOT NULL DEFAULT 'QUEUED',
    "text" TEXT,
    "audioSeconds" DOUBLE PRECISION,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(40),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bilan_job_segments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bilan_jobs_bilanId_key" ON "bilan_jobs"("bilanId");

-- CreateIndex
CREATE INDEX "bilan_jobs_kineId_status_idx" ON "bilan_jobs"("kineId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bilan_job_segments_jobId_index_key" ON "bilan_job_segments"("jobId", "index");

-- AddForeignKey
ALTER TABLE "bilan_jobs" ADD CONSTRAINT "bilan_jobs_bilanId_fkey" FOREIGN KEY ("bilanId") REFERENCES "bilans_kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bilan_jobs" ADD CONSTRAINT "bilan_jobs_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bilan_job_segments" ADD CONSTRAINT "bilan_job_segments_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "bilan_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
