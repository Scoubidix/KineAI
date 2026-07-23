-- AlterTable
ALTER TABLE "visio_seances" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "visio_seances_kineId_isArchived_idx" ON "visio_seances"("kineId", "isArchived");
