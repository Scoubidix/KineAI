-- Migration sécurisée pour ajouter programmeId aux chat_sessions existantes

-- Étape 1: Ajouter les nouvelles colonnes au modèle Programme
ALTER TABLE "Programme" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Étape 2: Ajouter programmeId comme colonne optionnelle d'abord
ALTER TABLE "chat_sessions" ADD COLUMN "programmeId" INTEGER;

-- Étape 3: Migrer les données existantes
-- Associer chaque session de chat au programme le plus récent du patient
UPDATE "chat_sessions" 
SET "programmeId" = (
    SELECT p.id 
    FROM "Programme" p 
    WHERE p."patientId" = "chat_sessions"."patientId" 
    ORDER BY p."createdAt" DESC 
    LIMIT 1
)
WHERE "programmeId" IS NULL;

-- Étape 4: Supprimer les sessions de chat orphelines (patients sans programme)
DELETE FROM "chat_sessions" WHERE "programmeId" IS NULL;

-- Étape 5: Rendre programmeId obligatoire maintenant qu'il n'y a plus de valeurs nulles
ALTER TABLE "chat_sessions" ALTER COLUMN "programmeId" SET NOT NULL;

-- Étape 6: Ajouter la contrainte de clé étrangère
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_programmeId_fkey" FOREIGN KEY ("programmeId") REFERENCES "Programme"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Étape 7: Supprimer la colonne sessionDate (plus nécessaire)
DROP INDEX IF EXISTS "chat_sessions_sessionDate_idx";
DROP INDEX IF EXISTS "chat_sessions_patientId_sessionDate_idx";
ALTER TABLE "chat_sessions" DROP COLUMN IF EXISTS "sessionDate";

-- Étape 8: Ajouter les nouveaux index
CREATE INDEX "chat_sessions_patientId_programmeId_idx" ON "chat_sessions"("patientId", "programmeId");
CREATE INDEX "chat_sessions_programmeId_idx" ON "chat_sessions"("programmeId");