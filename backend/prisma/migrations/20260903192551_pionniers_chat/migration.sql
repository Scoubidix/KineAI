-- CreateTable
CREATE TABLE "pionnier_messages" (
    "id" SERIAL NOT NULL,
    "body" TEXT NOT NULL,
    "imagePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedByAdmin" BOOLEAN NOT NULL DEFAULT false,
    "authorId" INTEGER NOT NULL,
    "replyToId" INTEGER,

    CONSTRAINT "pionnier_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pionnier_reads" (
    "kineId" INTEGER NOT NULL,
    "lastReadMessageId" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pionnier_reads_pkey" PRIMARY KEY ("kineId")
);

-- CreateIndex
CREATE INDEX "pionnier_messages_createdAt_idx" ON "pionnier_messages"("createdAt");

-- CreateIndex
CREATE INDEX "pionnier_messages_authorId_idx" ON "pionnier_messages"("authorId");

-- AddForeignKey
ALTER TABLE "pionnier_messages" ADD CONSTRAINT "pionnier_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pionnier_messages" ADD CONSTRAINT "pionnier_messages_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "pionnier_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pionnier_reads" ADD CONSTRAINT "pionnier_reads_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
