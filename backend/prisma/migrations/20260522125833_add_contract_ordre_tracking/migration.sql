-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "ordreMessageId" TEXT,
ADD COLUMN     "ordreRecipientEmail" VARCHAR(255),
ADD COLUMN     "ordreSentAt" TIMESTAMP(3);
