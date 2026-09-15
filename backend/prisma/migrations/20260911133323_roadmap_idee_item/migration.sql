-- AlterTable
ALTER TABLE "roadmap_idees" ADD COLUMN     "itemId" INTEGER;

-- CreateIndex
CREATE INDEX "roadmap_idees_itemId_idx" ON "roadmap_idees"("itemId");

-- AddForeignKey
ALTER TABLE "roadmap_idees" ADD CONSTRAINT "roadmap_idees_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "roadmap_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

