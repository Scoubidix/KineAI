-- CreateEnum
CREATE TYPE "BilanStatus" AS ENUM ('BROUILLON', 'GENERE', 'ENREGISTRE');

-- CreateEnum
CREATE TYPE "FieldPresentation" AS ENUM ('TABLE', 'NARRATIVE');

-- AlterTable
ALTER TABLE "bilan_canonical_fields" ADD COLUMN     "aliases" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "lateralized" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "presentation" "FieldPresentation" NOT NULL DEFAULT 'TABLE';

-- AlterTable
ALTER TABLE "bilans_kine" ADD COLUMN     "copilotConversationId" INTEGER,
ADD COLUMN     "document" JSONB,
ADD COLUMN     "status" "BilanStatus" NOT NULL DEFAULT 'BROUILLON',
ALTER COLUMN "rawNotes" DROP NOT NULL,
ALTER COLUMN "bilanHtml" DROP NOT NULL,
ALTER COLUMN "patientId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "bilans_kine_copilotConversationId_key" ON "bilans_kine"("copilotConversationId");

-- CreateIndex
CREATE INDEX "bilans_kine_kineId_status_updatedAt_idx" ON "bilans_kine"("kineId", "status", "updatedAt");

-- AddForeignKey
ALTER TABLE "bilans_kine" ADD CONSTRAINT "bilans_kine_copilotConversationId_fkey" FOREIGN KEY ("copilotConversationId") REFERENCES "conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Les bilans existants ont tous un bilanHtml : ce sont des bilans terminés.
UPDATE "bilans_kine" SET "status" = 'ENREGISTRE';
