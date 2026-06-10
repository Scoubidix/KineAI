-- CreateTable
CREATE TABLE "conversation" (
    "id" SERIAL NOT NULL,
    "title" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "kineId" INTEGER NOT NULL,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_message" (
    "id" SERIAL NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "iaType" TEXT,
    "ragUsed" BOOLEAN,
    "model" TEXT,
    "tokensUsed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" INTEGER NOT NULL,

    CONSTRAINT "conversation_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_token_usage" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "kineId" INTEGER NOT NULL,

    CONSTRAINT "daily_token_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_kineId_updatedAt_idx" ON "conversation"("kineId", "updatedAt");

-- CreateIndex
CREATE INDEX "conversation_message_conversationId_createdAt_idx" ON "conversation_message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "daily_token_usage_kineId_date_key" ON "daily_token_usage"("kineId", "date");

-- AddForeignKey
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_message" ADD CONSTRAINT "conversation_message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_token_usage" ADD CONSTRAINT "daily_token_usage_kineId_fkey" FOREIGN KEY ("kineId") REFERENCES "Kine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
