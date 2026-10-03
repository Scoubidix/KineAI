// services/legacyDemoLinksService.js — Go/no-go du ménage GCS (carte admin)
//
// Avant la route de redirection (/api/media/demo), les démos du chat patient
// étaient des URLs GCS v2 écrites en dur dans les messages, valables jusqu'à
// la dateFin du programme. Tant qu'un patient peut encore ouvrir un chat qui en
// contient, le bucket GCS et `storage.googleapis.com` (CSP, sw.ts, DEMO_LINK
// d'openaiService) doivent rester en place.
// ⚠️ Temporaire : à supprimer, avec sa route et sa carte, une fois le ménage fait.
const prismaService = require('./prismaService');

/**
 * Programmes dont le chat est encore accessible (mêmes règles que
 * middleware/patientAuth.js) et qui contiennent au moins un ancien lien GCS.
 * @returns {Promise<{ count: number, lastDateFin: Date|null, ready: boolean }>}
 */
async function getLegacyDemoLinksStatus() {
  const prisma = prismaService.getInstance();
  const result = await prisma.programme.aggregate({
    where: {
      isActive: true,
      isArchived: false,
      patient: { isActive: true },
      chatSessions: { some: { message: { contains: 'storage.googleapis.com' } } },
    },
    _count: { _all: true },
    _max: { dateFin: true },
  });

  const count = result._count._all;
  return { count, lastDateFin: result._max.dateFin, ready: count === 0 };
}

module.exports = { getLegacyDemoLinksStatus };
