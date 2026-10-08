-- CreateTable
CREATE TABLE "patient_notes" (
    "id" SERIAL NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "patientId" INTEGER NOT NULL,
    "kineId" INTEGER NOT NULL,

    CONSTRAINT "patient_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_notes_patientId_isActive_createdAt_idx" ON "patient_notes"("patientId", "isActive", "createdAt");

-- AddForeignKey
ALTER TABLE "patient_notes" ADD CONSTRAINT "patient_notes_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_notes" ADD CONSTRAINT "patient_notes_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
