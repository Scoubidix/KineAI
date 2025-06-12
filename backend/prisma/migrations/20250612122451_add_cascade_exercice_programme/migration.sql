-- DropForeignKey
ALTER TABLE "ExerciceProgramme" DROP CONSTRAINT "ExerciceProgramme_programmeId_fkey";

-- AddForeignKey
ALTER TABLE "ExerciceProgramme" ADD CONSTRAINT "ExerciceProgramme_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
