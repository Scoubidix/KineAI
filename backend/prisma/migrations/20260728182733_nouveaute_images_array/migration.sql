/*
  Warnings:

  - You are about to drop the column `imagePath` on the `nouveautes` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "nouveautes" DROP COLUMN "imagePath",
ADD COLUMN     "imagePaths" TEXT[] DEFAULT ARRAY[]::TEXT[];
