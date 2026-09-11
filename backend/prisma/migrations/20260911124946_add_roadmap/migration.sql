-- CreateEnum
CREATE TYPE "roadmap_horizon" AS ENUM ('COURT_TERME', 'MOYEN_LONG_TERME');

-- CreateEnum
CREATE TYPE "roadmap_statut" AS ENUM ('PREVU', 'EN_COURS', 'LIVRE');

-- CreateEnum
CREATE TYPE "roadmap_idee_statut" AS ENUM ('NOUVELLE', 'VUE', 'RETENUE', 'ECARTEE');

-- CreateTable
CREATE TABLE "roadmap_items" (
    "id" SERIAL NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "horizon" "roadmap_horizon" NOT NULL,
    "statut" "roadmap_statut" NOT NULL DEFAULT 'PREVU',
    "isObjectifPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roadmap_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_idees" (
    "id" SERIAL NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "statut" "roadmap_idee_statut" NOT NULL DEFAULT 'NOUVELLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "kineId" INTEGER NOT NULL,

    CONSTRAINT "roadmap_idees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roadmap_items_isActive_horizon_idx" ON "roadmap_items"("isActive", "horizon");

-- CreateIndex
CREATE INDEX "roadmap_idees_statut_createdAt_idx" ON "roadmap_idees"("statut", "createdAt");

-- CreateIndex
CREATE INDEX "roadmap_idees_kineId_idx" ON "roadmap_idees"("kineId");

-- AddForeignKey
ALTER TABLE "roadmap_idees" ADD CONSTRAINT "roadmap_idees_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

