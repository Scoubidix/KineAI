-- CreateTable
CREATE TABLE "bilan_templates" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" VARCHAR(500),
    "category" VARCHAR(80) NOT NULL,
    "items" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "kineId" INTEGER,

    CONSTRAINT "bilan_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bilan_templates_isPublic_isActive_idx" ON "bilan_templates"("isPublic", "isActive");

-- CreateIndex
CREATE INDEX "bilan_templates_kineId_isActive_idx" ON "bilan_templates"("kineId", "isActive");

-- AddForeignKey
ALTER TABLE "bilan_templates" ADD CONSTRAINT "bilan_templates_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
