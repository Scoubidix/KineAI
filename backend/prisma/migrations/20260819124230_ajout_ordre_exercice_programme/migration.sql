-- AlterTable
ALTER TABLE "ExerciceProgramme" ADD COLUMN     "ordre" INTEGER NOT NULL DEFAULT 0;

-- Backfill : preserver l'ordre implicite (par id) des programmes existants,
-- sinon tous les exercices se retrouveraient a ordre = 0.
UPDATE "ExerciceProgramme" ep
SET "ordre" = sub.rn - 1
FROM (
  SELECT id, row_number() OVER (PARTITION BY "programmeId" ORDER BY id) AS rn
  FROM "ExerciceProgramme"
) sub
WHERE ep.id = sub.id;
