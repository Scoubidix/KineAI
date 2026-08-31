const prismaService = require('./prismaService');

/**
 * Contrôle d'accès aux ExerciceModele référencés par un programme ou un template.
 *
 * Un ExerciceModele est une ressource par kiné (`kineId` + `isPublic`) : la
 * lecture de la bibliothèque est bien filtrée, mais les chemins d'ÉCRITURE se
 * contentaient d'un `connect` sur l'id reçu. Comme la relecture renvoie ensuite
 * l'exercice rattaché avec ses URLs signées, il suffisait d'énumérer les ids
 * pour récupérer les vidéos privées des autres kinés.
 *
 * D'où ce point de passage unique, appelé par les quatre écritures concernées
 * (création/modification de programme, création/modification de template).
 */

/**
 * @param {number} kineId - Kiné authentifié (req.kineId / kine.id)
 * @param {Array<number|string>} exerciceIds - Ids soumis par le client
 * @returns {Promise<{ok: boolean, forbidden: number[], invalid: boolean}>}
 *   `ok` faux si un id est mal formé ou pointe vers un exercice privé d'autrui.
 */
async function checkExercicesAccessibles(kineId, exerciceIds) {
  const bruts = Array.isArray(exerciceIds) ? exerciceIds : [];

  // Les routes templates n'ont pas de schéma Zod : on ne peut pas supposer que
  // les ids soient déjà des entiers.
  const ids = bruts.map((id) => (typeof id === 'number' ? id : Number(id)));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    return { ok: false, forbidden: [], invalid: true };
  }

  const uniques = [...new Set(ids)];
  if (uniques.length === 0) {
    return { ok: true, forbidden: [], invalid: false };
  }

  const prisma = prismaService.getInstance();
  // Même règle de visibilité que la bibliothèque (getPrivateExercices) : public,
  // ou m'appartenant.
  const accessibles = await prisma.exerciceModele.findMany({
    where: {
      id: { in: uniques },
      OR: [{ isPublic: true }, { kineId }],
    },
    select: { id: true },
  });

  const autorises = new Set(accessibles.map((ex) => ex.id));
  const forbidden = uniques.filter((id) => !autorises.has(id));

  return { ok: forbidden.length === 0, forbidden, invalid: false };
}

module.exports = { checkExercicesAccessibles };
