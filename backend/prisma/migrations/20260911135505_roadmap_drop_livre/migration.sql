-- Une card livrée devient inactive (le module Nouveautés prend le relais)
UPDATE "roadmap_items" SET "statut" = 'PREVU', "isActive" = false WHERE "statut" = 'LIVRE';

-- AlterEnum
BEGIN;
CREATE TYPE "roadmap_statut_new" AS ENUM ('PREVU', 'EN_COURS');
ALTER TABLE "roadmap_items" ALTER COLUMN "statut" DROP DEFAULT;
ALTER TABLE "roadmap_items" ALTER COLUMN "statut" TYPE "roadmap_statut_new" USING ("statut"::text::"roadmap_statut_new");
ALTER TYPE "roadmap_statut" RENAME TO "roadmap_statut_old";
ALTER TYPE "roadmap_statut_new" RENAME TO "roadmap_statut";
DROP TYPE "roadmap_statut_old";
ALTER TABLE "roadmap_items" ALTER COLUMN "statut" SET DEFAULT 'PREVU';
COMMIT;

