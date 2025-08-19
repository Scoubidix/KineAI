-- CreateEnum
CREATE TYPE "plan_type" AS ENUM ('DECLIC', 'PRATIQUE', 'EXPERT');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('ACTIVE', 'CANCELED', 'PAST_DUE', 'UNPAID', 'INCOMPLETE', 'INCOMPLETE_EXPIRED', 'TRIALING', 'PAUSED');

-- AlterTable
ALTER TABLE "Kine" ADD COLUMN     "planType" "plan_type",
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "subscriptionEndDate" TIMESTAMP(3),
ADD COLUMN     "subscriptionId" TEXT,
ADD COLUMN     "subscriptionStartDate" TIMESTAMP(3),
ADD COLUMN     "subscriptionStatus" "subscription_status",
ADD COLUMN     "trialEndDate" TIMESTAMP(3);
