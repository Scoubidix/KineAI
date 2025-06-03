/*
  Warnings:

  - Changed the type of `kineId` on the `Patient` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Made the column `description` on table `Programme` required. This step will fail if there are existing NULL values in that column.
  - Made the column `kineId` on table `Programme` required. This step will fail if there are existing NULL values in that column.
  - Made the column `patientId` on table `Programme` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Patient" DROP CONSTRAINT "Patient_kineId_fkey";

-- DropForeignKey
ALTER TABLE "Programme" DROP CONSTRAINT "Programme_kineId_fkey";

-- DropForeignKey
ALTER TABLE "Programme" DROP CONSTRAINT "Programme_patientId_fkey";

-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "kineId",
ADD COLUMN     "kineId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Programme" ALTER COLUMN "description" SET NOT NULL,
ALTER COLUMN "kineId" SET NOT NULL,
ALTER COLUMN "patientId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Programme" ADD CONSTRAINT "Programme_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Programme" ADD CONSTRAINT "Programme_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
