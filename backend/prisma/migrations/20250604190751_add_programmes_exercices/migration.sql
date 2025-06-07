/*
  Warnings:

  - You are about to drop the column `kineId` on the `Programme` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Programme` table. All the data in the column will be lost.
  - Added the required column `dateFin` to the `Programme` table without a default value. This is not possible if the table is not empty.
  - Added the required column `duree` to the `Programme` table without a default value. This is not possible if the table is not empty.
  - Added the required column `titre` to the `Programme` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Programme" DROP CONSTRAINT "Programme_kineId_fkey";

-- AlterTable
ALTER TABLE "Programme" DROP COLUMN "kineId",
DROP COLUMN "title",
ADD COLUMN     "dateDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dateFin" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "duree" INTEGER NOT NULL,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "titre" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ExerciceModele" (
    "id" SERIAL NOT NULL,
    "kineId" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciceModele_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExerciceProgramme" (
    "id" SERIAL NOT NULL,
    "programmeId" INTEGER NOT NULL,
    "exerciceModeleId" INTEGER NOT NULL,
    "series" INTEGER NOT NULL,
    "repetitions" INTEGER NOT NULL,
    "pause" INTEGER NOT NULL,
    "consigne" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciceProgramme_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ExerciceModele" ADD CONSTRAINT "ExerciceModele_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciceProgramme" ADD CONSTRAINT "ExerciceProgramme_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciceProgramme" ADD CONSTRAINT "ExerciceProgramme_exerciceModeleId_fkey" FOREIGN KEY ("exerciceModeleId") REFERENCES "ExerciceModele"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
