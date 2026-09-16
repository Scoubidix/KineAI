-- CreateEnum
CREATE TYPE "dictation_term_statut" AS ENUM ('NOUVEAU', 'RETENU', 'ECARTE');

-- CreateTable
CREATE TABLE "dictation_terms" (
    "id" SERIAL NOT NULL,
    "heard" VARCHAR(80) NOT NULL,
    "expected" VARCHAR(80) NOT NULL,
    "heardNorm" VARCHAR(80) NOT NULL,
    "expectedNorm" VARCHAR(80) NOT NULL,
    "statut" "dictation_term_statut" NOT NULL DEFAULT 'NOUVEAU',
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "lastReportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dictation_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictation_term_reports" (
    "id" SERIAL NOT NULL,
    "termId" INTEGER NOT NULL,
    "kineId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dictation_term_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dictation_terms_statut_idx" ON "dictation_terms"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "dictation_terms_heardNorm_expectedNorm_key" ON "dictation_terms"("heardNorm", "expectedNorm");

-- CreateIndex
CREATE INDEX "dictation_term_reports_termId_idx" ON "dictation_term_reports"("termId");

-- CreateIndex
CREATE INDEX "dictation_term_reports_kineId_idx" ON "dictation_term_reports"("kineId");

-- AddForeignKey
ALTER TABLE "dictation_term_reports" ADD CONSTRAINT "dictation_term_reports_termId_fkey" FOREIGN KEY ("termId") REFERENCES "dictation_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dictation_term_reports" ADD CONSTRAINT "dictation_term_reports_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
