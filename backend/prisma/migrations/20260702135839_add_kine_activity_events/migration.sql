-- CreateEnum
CREATE TYPE "KineActivityType" AS ENUM ('IA_SEARCH', 'BILAN_GENERATED', 'PROGRAMME_CREATED', 'ADMIN_LETTER', 'CONTRACT_CREATED');

-- CreateTable
CREATE TABLE "kine_activity_events" (
    "id" SERIAL NOT NULL,
    "kineId" INTEGER NOT NULL,
    "type" "KineActivityType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kine_activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kine_activity_events_kineId_createdAt_idx" ON "kine_activity_events"("kineId", "createdAt");

-- CreateIndex
CREATE INDEX "kine_activity_events_kineId_type_idx" ON "kine_activity_events"("kineId", "type");

-- AddForeignKey
ALTER TABLE "kine_activity_events" ADD CONSTRAINT "kine_activity_events_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
