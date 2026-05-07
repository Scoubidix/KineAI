-- CreateEnum
CREATE TYPE "communication_method" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "referral_status" AS ENUM ('PENDING', 'COMPLETED', 'CANCELED', 'EXPIRED', 'FRAUD');

-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "BilanType" AS ENUM ('INITIAL', 'INTERMEDIAIRE', 'FINAL');

-- CreateEnum
CREATE TYPE "CanonicalFieldType" AS ENUM ('NUMERIC', 'BOOLEAN', 'TEXT', 'ENUM');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "notification_type" ADD VALUE 'PATIENT_REQUEST';
ALTER TYPE "notification_type" ADD VALUE 'SUPPORT_REPLY';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "plan_type" ADD VALUE 'FREE';
ALTER TYPE "plan_type" ADD VALUE 'PIONNIER';

-- DropForeignKey
ALTER TABLE "chat_kine" DROP CONSTRAINT "chat_kine_kineId_fkey";

-- AlterTable
ALTER TABLE "ExerciceModele" ADD COLUMN     "gifPath" TEXT,
ADD COLUMN     "gifUrl" TEXT;

-- AlterTable
ALTER TABLE "ExerciceProgramme" ADD COLUMN     "tempsTravail" INTEGER DEFAULT 0;

-- AlterTable
ALTER TABLE "Kine" ADD COLUMN     "acceptedCguAt" TIMESTAMP(3),
ADD COLUMN     "acceptedPolitiqueConfidentialiteAt" TIMESTAMP(3),
ADD COLUMN     "avatarPath" TEXT,
ADD COLUMN     "cguVersion" TEXT,
ADD COLUMN     "politiqueConfidentialiteVersion" TEXT,
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "signupIpAddress" TEXT,
ALTER COLUMN "phone" DROP NOT NULL,
ALTER COLUMN "rpps" DROP NOT NULL,
ALTER COLUMN "adresseCabinet" DROP NOT NULL,
ALTER COLUMN "birthDate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "emailConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "whatsappConsent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Programme" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE "chat_kine";

-- CreateTable
CREATE TABLE "exercice_templates" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "kineId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exercice_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercice_template_items" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "exerciceModeleId" INTEGER NOT NULL,
    "ordre" INTEGER NOT NULL,
    "series" INTEGER NOT NULL DEFAULT 3,
    "repetitions" INTEGER NOT NULL DEFAULT 10,
    "tempsRepos" INTEGER NOT NULL DEFAULT 30,
    "tempsTravail" INTEGER DEFAULT 0,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exercice_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_ia_basique" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kineId" INTEGER NOT NULL,

    CONSTRAINT "chat_ia_basique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_ia_biblio" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kineId" INTEGER NOT NULL,

    CONSTRAINT "chat_ia_biblio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_ia_clinique" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kineId" INTEGER NOT NULL,

    CONSTRAINT "chat_ia_clinique_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_ia_administrative" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kineId" INTEGER NOT NULL,

    CONSTRAINT "chat_ia_administrative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rgpd_exports" (
    "id" SERIAL NOT NULL,
    "kineId" INTEGER NOT NULL,
    "exportToken" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloadedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "fileSize" INTEGER,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "ipAddress" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "rgpd_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_templates" (
    "id" SERIAL NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "subject" VARCHAR(255),
    "body" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "kineId" INTEGER,

    CONSTRAINT "admin_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates_sent_history" (
    "id" SERIAL NOT NULL,
    "kineId" INTEGER NOT NULL,
    "patientId" INTEGER,
    "contactId" INTEGER,
    "templateId" INTEGER,
    "templateTitle" VARCHAR(255) NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "body" TEXT NOT NULL,
    "recipientName" VARCHAR(255) NOT NULL DEFAULT 'Inconnu',
    "recipientEmail" VARCHAR(255),
    "patientEmail" VARCHAR(255),
    "patientPhone" VARCHAR(20),
    "method" "communication_method" NOT NULL DEFAULT 'EMAIL',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "templates_sent_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" SERIAL NOT NULL,
    "kineId" INTEGER NOT NULL,
    "firstName" VARCHAR(100),
    "lastName" VARCHAR(100),
    "email" VARCHAR(255),
    "phone" VARCHAR(20),
    "type" VARCHAR(100),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" SERIAL NOT NULL,
    "referrerId" INTEGER NOT NULL,
    "refereeId" INTEGER NOT NULL,
    "planSubscribed" "plan_type" NOT NULL,
    "creditAmount" DOUBLE PRECISION NOT NULL,
    "status" "referral_status" NOT NULL DEFAULT 'PENDING',
    "referrerCredited" BOOLEAN NOT NULL DEFAULT false,
    "refereeCredited" BOOLEAN NOT NULL DEFAULT false,
    "creditedAt" TIMESTAMP(3),
    "refereeEmail" TEXT NOT NULL,
    "refereeIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_tickets" (
    "id" SERIAL NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "status" "ticket_status" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "kineId" INTEGER NOT NULL,

    CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_messages" (
    "id" SERIAL NOT NULL,
    "body" TEXT NOT NULL,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ticketId" INTEGER NOT NULL,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_acceptances" (
    "id" SERIAL NOT NULL,
    "kineId" INTEGER NOT NULL,
    "documentType" VARCHAR(50) NOT NULL,
    "documentVersion" VARCHAR(10) NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bilans_kine" (
    "id" SERIAL NOT NULL,
    "motif" VARCHAR(500),
    "rawNotes" TEXT NOT NULL,
    "bilanHtml" TEXT NOT NULL,
    "type" "BilanType" NOT NULL DEFAULT 'INITIAL',
    "structuredData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "kineId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,

    CONSTRAINT "bilans_kine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bilan_canonical_fields" (
    "id" SERIAL NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "type" "CanonicalFieldType" NOT NULL,
    "unit" VARCHAR(20),
    "rangeMin" DOUBLE PRECISION,
    "rangeMax" DOUBLE PRECISION,
    "options" JSONB,
    "category" VARCHAR(80) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bilan_canonical_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exercice_templates_kineId_idx" ON "exercice_templates"("kineId");

-- CreateIndex
CREATE INDEX "exercice_templates_isPublic_idx" ON "exercice_templates"("isPublic");

-- CreateIndex
CREATE INDEX "exercice_template_items_templateId_idx" ON "exercice_template_items"("templateId");

-- CreateIndex
CREATE INDEX "exercice_template_items_exerciceModeleId_idx" ON "exercice_template_items"("exerciceModeleId");

-- CreateIndex
CREATE INDEX "chat_ia_basique_kineId_createdAt_idx" ON "chat_ia_basique"("kineId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_ia_biblio_kineId_createdAt_idx" ON "chat_ia_biblio"("kineId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_ia_clinique_kineId_createdAt_idx" ON "chat_ia_clinique"("kineId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_ia_administrative_kineId_createdAt_idx" ON "chat_ia_administrative"("kineId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "rgpd_exports_exportToken_key" ON "rgpd_exports"("exportToken");

-- CreateIndex
CREATE INDEX "rgpd_exports_kineId_generatedAt_idx" ON "rgpd_exports"("kineId", "generatedAt");

-- CreateIndex
CREATE INDEX "rgpd_exports_exportToken_idx" ON "rgpd_exports"("exportToken");

-- CreateIndex
CREATE INDEX "rgpd_exports_expiresAt_idx" ON "rgpd_exports"("expiresAt");

-- CreateIndex
CREATE INDEX "admin_templates_category_idx" ON "admin_templates"("category");

-- CreateIndex
CREATE INDEX "admin_templates_tags_idx" ON "admin_templates"("tags");

-- CreateIndex
CREATE INDEX "admin_templates_kineId_idx" ON "admin_templates"("kineId");

-- CreateIndex
CREATE INDEX "templates_sent_history_kineId_sentAt_idx" ON "templates_sent_history"("kineId", "sentAt");

-- CreateIndex
CREATE INDEX "templates_sent_history_patientId_idx" ON "templates_sent_history"("patientId");

-- CreateIndex
CREATE INDEX "templates_sent_history_contactId_idx" ON "templates_sent_history"("contactId");

-- CreateIndex
CREATE INDEX "templates_sent_history_templateId_idx" ON "templates_sent_history"("templateId");

-- CreateIndex
CREATE INDEX "contacts_kineId_idx" ON "contacts"("kineId");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_refereeId_key" ON "referrals"("refereeId");

-- CreateIndex
CREATE INDEX "referrals_referrerId_idx" ON "referrals"("referrerId");

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- CreateIndex
CREATE INDEX "referrals_createdAt_idx" ON "referrals"("createdAt");

-- CreateIndex
CREATE INDEX "support_tickets_kineId_status_idx" ON "support_tickets"("kineId", "status");

-- CreateIndex
CREATE INDEX "support_tickets_status_createdAt_idx" ON "support_tickets"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ticket_messages_ticketId_createdAt_idx" ON "ticket_messages"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "legal_acceptances_kineId_documentType_idx" ON "legal_acceptances"("kineId", "documentType");

-- CreateIndex
CREATE INDEX "bilans_kine_kineId_createdAt_idx" ON "bilans_kine"("kineId", "createdAt");

-- CreateIndex
CREATE INDEX "bilans_kine_patientId_createdAt_idx" ON "bilans_kine"("patientId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "bilan_canonical_fields_key_key" ON "bilan_canonical_fields"("key");

-- CreateIndex
CREATE INDEX "bilan_canonical_fields_isActive_category_order_idx" ON "bilan_canonical_fields"("isActive", "category", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Kine_referralCode_key" ON "Kine"("referralCode");

-- AddForeignKey
ALTER TABLE "exercice_templates" ADD CONSTRAINT "exercice_templates_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercice_template_items" ADD CONSTRAINT "exercice_template_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "exercice_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercice_template_items" ADD CONSTRAINT "exercice_template_items_exerciceModeleId_fkey" FOREIGN KEY ("exerciceModeleId") REFERENCES "ExerciceModele"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_ia_basique" ADD CONSTRAINT "chat_ia_basique_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_ia_biblio" ADD CONSTRAINT "chat_ia_biblio_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_ia_clinique" ADD CONSTRAINT "chat_ia_clinique_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_ia_administrative" ADD CONSTRAINT "chat_ia_administrative_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rgpd_exports" ADD CONSTRAINT "rgpd_exports_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_templates" ADD CONSTRAINT "admin_templates_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates_sent_history" ADD CONSTRAINT "templates_sent_history_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates_sent_history" ADD CONSTRAINT "templates_sent_history_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates_sent_history" ADD CONSTRAINT "templates_sent_history_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates_sent_history" ADD CONSTRAINT "templates_sent_history_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "admin_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_messages" ADD CONSTRAINT "ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bilans_kine" ADD CONSTRAINT "bilans_kine_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bilans_kine" ADD CONSTRAINT "bilans_kine_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
