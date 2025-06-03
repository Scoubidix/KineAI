/*
  Warnings:

  - You are about to drop the column `name` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `notes` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the column `pathology` on the `Patient` table. All the data in the column will be lost.
  - You are about to drop the `Program` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[email]` on the table `Kine` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[rpps]` on the table `Kine` will be added. If there are existing duplicate values, this will fail.
  - Made the column `phone` on table `Kine` required. This step will fail if there are existing NULL values in that column.
  - Made the column `rpps` on table `Kine` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `email` to the `Patient` table without a default value. This is not possible if the table is not empty.
  - Added the required column `firstName` to the `Patient` table without a default value. This is not possible if the table is not empty.
  - Added the required column `goals` to the `Patient` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastName` to the `Patient` table without a default value. This is not possible if the table is not empty.
  - Added the required column `phone` to the `Patient` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Patient" DROP CONSTRAINT "Patient_kineId_fkey";

-- DropForeignKey
ALTER TABLE "Program" DROP CONSTRAINT "Program_patientId_fkey";

-- AlterTable
ALTER TABLE "Kine" ALTER COLUMN "phone" SET NOT NULL,
ALTER COLUMN "rpps" SET NOT NULL;

-- AlterTable
ALTER TABLE "Patient" DROP COLUMN "name",
DROP COLUMN "notes",
DROP COLUMN "pathology",
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "goals" TEXT NOT NULL,
ADD COLUMN     "lastName" TEXT NOT NULL,
ADD COLUMN     "phone" TEXT NOT NULL,
ALTER COLUMN "kineId" SET DATA TYPE TEXT;

-- DropTable
DROP TABLE "Program";

-- CreateTable
CREATE TABLE "Programme" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "kineId" INTEGER,
    "patientId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Programme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Kine_email_key" ON "Kine"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Kine_rpps_key" ON "Kine"("rpps");

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("uid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Programme" ADD CONSTRAINT "Programme_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Programme" ADD CONSTRAINT "Programme_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
