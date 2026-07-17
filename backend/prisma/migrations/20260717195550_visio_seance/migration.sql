-- CreateEnum
CREATE TYPE "VisioStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisioChannel" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateTable
CREATE TABLE "visio_seances" (
    "id" SERIAL NOT NULL,
    "roomId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "VisioStatus" NOT NULL DEFAULT 'SCHEDULED',
    "deliveryChannel" "VisioChannel" NOT NULL,
    "linkSentAt" TIMESTAMP(3),
    "prereqsAttested" BOOLEAN NOT NULL DEFAULT false,
    "prereqsValidatedAt" TIMESTAMP(3),
    "patientInfoAckAt" TIMESTAMP(3),
    "consentOralAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "kineId" INTEGER NOT NULL,
    "patientId" INTEGER NOT NULL,

    CONSTRAINT "visio_seances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visio_seances_roomId_key" ON "visio_seances"("roomId");

-- CreateIndex
CREATE INDEX "visio_seances_kineId_scheduledAt_idx" ON "visio_seances"("kineId", "scheduledAt");

-- CreateIndex
CREATE INDEX "visio_seances_patientId_idx" ON "visio_seances"("patientId");

-- AddForeignKey
ALTER TABLE "visio_seances" ADD CONSTRAINT "visio_seances_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visio_seances" ADD CONSTRAINT "visio_seances_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
