-- AlterEnum
ALTER TYPE "BilanJobStatus" ADD VALUE 'REPORTING';

-- AlterTable
ALTER TABLE "bilan_jobs" ADD COLUMN     "consentAt" TIMESTAMP(3);
