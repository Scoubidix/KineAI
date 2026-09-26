-- CreateTable
CREATE TABLE "bilan_test_guides" (
    "id" SERIAL NOT NULL,
    "fieldKey" VARCHAR(80) NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "youtubeId" VARCHAR(11),
    "youtubeStart" INTEGER,
    "updatedBy" VARCHAR(255),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bilan_test_guides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bilan_test_guides_fieldKey_key" ON "bilan_test_guides"("fieldKey");
