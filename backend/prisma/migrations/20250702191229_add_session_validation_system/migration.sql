-- CreateTable
CREATE TABLE "session_validations" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "isValidated" BOOLEAN NOT NULL DEFAULT false,
    "validatedAt" TIMESTAMP(3),
    "painLevel" INTEGER,
    "difficultyLevel" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "patientId" INTEGER NOT NULL,
    "programmeId" INTEGER NOT NULL,

    CONSTRAINT "session_validations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "session_validations_date_programmeId_idx" ON "session_validations"("date", "programmeId");

-- CreateIndex
CREATE INDEX "session_validations_patientId_date_idx" ON "session_validations"("patientId", "date");

-- CreateIndex
CREATE INDEX "session_validations_programmeId_idx" ON "session_validations"("programmeId");

-- CreateIndex
CREATE UNIQUE INDEX "session_validations_patientId_programmeId_date_key" ON "session_validations"("patientId", "programmeId", "date");

-- AddForeignKey
ALTER TABLE "session_validations" ADD CONSTRAINT "session_validations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_validations" ADD CONSTRAINT "session_validations_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
