/*
  Warnings:

  - Added the required column `adresseCabinet` to the `Kine` table without a default value. This is not possible if the table is not empty.
  - Added the required column `birthDate` to the `Kine` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Kine" ADD COLUMN     "adresseCabinet" TEXT NOT NULL,
ADD COLUMN     "birthDate" TIMESTAMP(3) NOT NULL;
