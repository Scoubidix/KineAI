-- CreateEnum
CREATE TYPE "nouveaute_categorie" AS ENUM ('NOUVEAUTE', 'AMELIORATION', 'OFFRE');

-- CreateTable
CREATE TABLE "nouveautes" (
    "id" SERIAL NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imagePath" TEXT,
    "categorie" "nouveaute_categorie" NOT NULL DEFAULT 'NOUVEAUTE',
    "ctaLabel" TEXT,
    "ctaHref" TEXT,
    "ciblePlans" "plan_type"[],
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nouveautes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nouveaute_vues" (
    "id" SERIAL NOT NULL,
    "kineId" INTEGER NOT NULL,
    "nouveauteId" INTEGER NOT NULL,
    "vueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nouveaute_vues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nouveautes_isActive_publishedAt_idx" ON "nouveautes"("isActive", "publishedAt");

-- CreateIndex
CREATE INDEX "nouveaute_vues_kineId_idx" ON "nouveaute_vues"("kineId");

-- CreateIndex
CREATE UNIQUE INDEX "nouveaute_vues_kineId_nouveauteId_key" ON "nouveaute_vues"("kineId", "nouveauteId");

-- AddForeignKey
ALTER TABLE "nouveaute_vues" ADD CONSTRAINT "nouveaute_vues_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nouveaute_vues" ADD CONSTRAINT "nouveaute_vues_nouveauteId_fkey" FOREIGN KEY ("nouveauteId") REFERENCES "nouveautes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
