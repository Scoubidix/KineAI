-- CreateTable
CREATE TABLE "bilan_seed_state" (
    "id" SERIAL NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bilan_seed_state_pkey" PRIMARY KEY ("id")
);
