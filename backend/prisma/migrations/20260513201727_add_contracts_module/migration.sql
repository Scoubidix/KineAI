-- CreateEnum
CREATE TYPE "contract_type" AS ENUM ('REMPLACEMENT_LIBERAL', 'ASSISTANAT_LIBERAL');

-- CreateEnum
CREATE TYPE "contract_role_initiateur" AS ENUM ('TITULAIRE', 'REMPLACANT_OU_ASSISTANT');

-- CreateEnum
CREATE TYPE "contract_status" AS ENUM ('BROUILLON', 'SIGNE_INITIATEUR', 'ENVOYE', 'COMPLETE', 'ARCHIVE');

-- CreateEnum
CREATE TYPE "contract_signer_role" AS ENUM ('INITIATEUR', 'DESTINATAIRE');

-- AlterTable
ALTER TABLE "Kine" ADD COLUMN     "adresseDomicile" TEXT,
ADD COLUMN     "birthPlace" TEXT,
ADD COLUMN     "departementOrdre" TEXT,
ADD COLUMN     "numeroOrdinal" TEXT,
ADD COLUMN     "numeroUrssaf" TEXT;

-- CreateTable
CREATE TABLE "contacts_kine" (
    "id" SERIAL NOT NULL,
    "kineId" INTEGER NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_kine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" SERIAL NOT NULL,
    "kineInitiateurId" INTEGER NOT NULL,
    "type" "contract_type" NOT NULL,
    "roleInitiateur" "contract_role_initiateur" NOT NULL,
    "contactKineId" INTEGER,
    "kineDestinataireId" INTEGER,
    "destinataireFirstName" VARCHAR(100) NOT NULL,
    "destinataireLastName" VARCHAR(100) NOT NULL,
    "destinataireEmail" VARCHAR(255) NOT NULL,
    "destinatairePhone" VARCHAR(20),
    "data" JSONB NOT NULL,
    "status" "contract_status" NOT NULL DEFAULT 'BROUILLON',
    "pdfFinalUrl" TEXT,
    "accessToken" TEXT,
    "accessTokenEmailHash" TEXT,
    "accessTokenPhoneHash" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "accessTokenUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_signatures" (
    "id" SERIAL NOT NULL,
    "contractId" INTEGER NOT NULL,
    "signerRole" "contract_signer_role" NOT NULL,
    "signerKineId" INTEGER,
    "signerEmail" VARCHAR(255) NOT NULL,
    "signerFirstName" VARCHAR(100) NOT NULL,
    "signerLastName" VARCHAR(100) NOT NULL,
    "signatureText" VARCHAR(255) NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_kine_kineId_idx" ON "contacts_kine"("kineId");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_kine_kineId_email_key" ON "contacts_kine"("kineId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_accessToken_key" ON "contracts"("accessToken");

-- CreateIndex
CREATE INDEX "contracts_kineInitiateurId_createdAt_idx" ON "contracts"("kineInitiateurId", "createdAt");

-- CreateIndex
CREATE INDEX "contracts_kineDestinataireId_createdAt_idx" ON "contracts"("kineDestinataireId", "createdAt");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "contracts"("status");

-- CreateIndex
CREATE INDEX "contract_signatures_contractId_signerRole_idx" ON "contract_signatures"("contractId", "signerRole");

-- AddForeignKey
ALTER TABLE "contacts_kine" ADD CONSTRAINT "contacts_kine_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_kineInitiateurId_fkey" FOREIGN KEY ("kineInitiateurId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_contactKineId_fkey" FOREIGN KEY ("contactKineId") REFERENCES "contacts_kine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_kineDestinataireId_fkey" FOREIGN KEY ("kineDestinataireId") REFERENCES "Kine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_signerKineId_fkey" FOREIGN KEY ("signerKineId") REFERENCES "Kine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
