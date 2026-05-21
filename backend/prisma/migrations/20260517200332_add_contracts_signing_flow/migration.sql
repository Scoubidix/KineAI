/*
  Warnings:

  - You are about to drop the column `accessToken` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `accessTokenEmailHash` on the `contracts` table. All the data in the column will be lost.
  - You are about to drop the column `accessTokenPhoneHash` on the `contracts` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[accessTokenHash]` on the table `contracts` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "contract_invite_channel" AS ENUM ('EMAIL', 'WHATSAPP', 'BOTH');

-- CreateEnum
CREATE TYPE "signer_account_type" AS ENUM ('EXISTING_KINE', 'NEW_KINE', 'GUEST');

-- DropIndex
DROP INDEX "contracts_accessToken_key";

-- AlterTable
ALTER TABLE "Kine" ADD COLUMN     "lastContractsViewedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "contract_signatures" ADD COLUMN     "accountType" "signer_account_type",
ADD COLUMN     "guestData" JSONB,
ADD COLUMN     "mention" VARCHAR(255);

-- AlterTable
ALTER TABLE "contracts" DROP COLUMN "accessToken",
DROP COLUMN "accessTokenEmailHash",
DROP COLUMN "accessTokenPhoneHash",
ADD COLUMN     "accessTokenChannel" "contract_invite_channel",
ADD COLUMN     "accessTokenHash" TEXT,
ADD COLUMN     "accessTokenRevokedAt" TIMESTAMP(3),
ADD COLUMN     "accessTokenSentAt" TIMESTAMP(3),
ADD COLUMN     "auditLog" JSONB,
ADD COLUMN     "pdfFinalGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "pdfFinalHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "contracts_accessTokenHash_key" ON "contracts"("accessTokenHash");
