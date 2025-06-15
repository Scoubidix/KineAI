-- CreateTable
CREATE TABLE "chat_kine" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kineId" INTEGER NOT NULL,

    CONSTRAINT "chat_kine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_kine_kineId_createdAt_idx" ON "chat_kine"("kineId", "createdAt");

-- AddForeignKey
ALTER TABLE "chat_kine" ADD CONSTRAINT "chat_kine_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
