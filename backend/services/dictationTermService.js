// Vocabulaire signalé par les kinés : normalisation, gardes, écriture et lecture.
// Ce qui entre ici est du vocabulaire métier, jamais du contenu clinique : les gardes
// ci-dessous refusent les noms et les phrases, et rien d'autre n'est stocké.
const { DraftError } = require('./bilanDraftService');
const logger = require('../utils/logger');
const prismaService = require('./prismaService');
const { createPseudonymizer } = require('./pseudonymService');

/** Bornes de la spec : un terme, pas une phrase. */
const MAX_CHARS = 80;
const MAX_WORDS = 4;

/** Repli : accents retirés, minuscules, ponctuation en espace, espaces compactés.
 *  Le trait d'union est conservé — « Sauvé-Kapandji » est un seul terme. */
function normalizeTerm(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,;:!?()«»"'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Valide une paire et renvoie ses quatre formes. Lève une DraftError sinon. */
function validateTerm({ heard, expected }) {
  const h = String(heard ?? '').trim();
  const e = String(expected ?? '').trim();
  const tooLong = () => new DraftError('TERM_TOO_LONG', 400, 'Sélectionne un terme, pas une phrase');
  if (h.length > MAX_CHARS || e.length > MAX_CHARS) throw tooLong();

  const heardNorm = normalizeTerm(h);
  const expectedNorm = normalizeTerm(e);
  if (!heardNorm || !expectedNorm) throw new DraftError('VALIDATION_ERROR', 400, 'Terme vide');
  if (heardNorm.split(' ').length > MAX_WORDS || expectedNorm.split(' ').length > MAX_WORDS) throw tooLong();
  if (heardNorm === expectedNorm) throw new DraftError('VALIDATION_ERROR', 400, 'Le terme attendu est identique à celui entendu');
  // Le vocabulaire ne porte pas de nombres : ils sont déjà protégés par les gardes du correcteur
  if (/^[\d\s.,-]+$/.test(expectedNorm)) throw new DraftError('VALIDATION_ERROR', 400, 'Un nombre n’est pas un terme');
  // Jetons de pseudonymisation : en mode libre les notes portent [Prénom], [NOM], [âge]. Retenu,
  // un tel « terme » inviterait le modèle à écrire un jeton dans les notes d'autres kinés.
  // Même garde que sanitizeMotif, qui rejette déjà tout motif porteur de crochet.
  if (/[[\]]/.test(h) || /[[\]]/.test(e)) throw new DraftError('VALIDATION_ERROR', 400, 'Ce n’est pas un terme à signaler');

  return { heard: h, expected: e, heardNorm, expectedNorm };
}

/**
 * Refuse toute forme qui porte une identité. Le pseudonymiseur du bilan sait masquer le patient
 * et le kiné : si le texte masqué diffère de l'original, c'est qu'il contenait une identité.
 * Un faux positif (rare) coûte un refus au kiné, jamais une fuite en base.
 */
function assertNoIdentity(pseudo, ...values) {
  for (const v of values) {
    if (pseudo.mask(v) !== v) throw new DraftError('IDENTITY_IN_TERM', 400, 'Les noms ne sont pas collectés : signale seulement le terme technique');
  }
}

/**
 * Enregistre un signalement. La route vit sous un bilan parce que c'est lui qui donne le patient,
 * donc le pseudonymiseur, donc la garde d'identité.
 *
 * Le statut n'est jamais touché à la mise à jour : une paire écartée voit son compteur monter sans
 * repasser NOUVEAU — une décision d'admin ne se défait pas toute seule.
 */
async function report({ kineId, bilanId, heard, expected, correctorOutput = null }) {
  const prisma = prismaService.getInstance();
  const bilan = await prisma.bilanKine.findFirst({
    where: { id: bilanId, kineId, isActive: true },
    select: { patient: { select: { firstName: true, lastName: true, birthDate: true } } },
  });
  if (!bilan) throw new DraftError('BILAN_NOT_FOUND', 404, 'Bilan non trouvé ou accès refusé');

  const clean = validateTerm({ heard, expected });
  // Ce que le correcteur avait écrit, quand le kiné signale SA sortie : `heard` porte alors la
  // forme d'origine, résolue côté client. Soumis aux mêmes gardes que le reste.
  const via = String(correctorOutput ?? '').trim().slice(0, MAX_CHARS) || null;
  const kine = await prisma.kine.findUnique({ where: { id: kineId }, select: { firstName: true, lastName: true, email: true } });
  assertNoIdentity(createPseudonymizer({ patient: bilan.patient, kine }), clean.heard, clean.expected, ...(via ? [via] : []));

  await prisma.$transaction(async (tx) => {
    const term = await tx.dictationTerm.upsert({
      where: { heardNorm_expectedNorm: { heardNorm: clean.heardNorm, expectedNorm: clean.expectedNorm } },
      update: { reportCount: { increment: 1 }, lastReportedAt: new Date() },
      create: {
        heard: clean.heard, expected: clean.expected,
        heardNorm: clean.heardNorm, expectedNorm: clean.expectedNorm,
        correctorOutput: via,
        reportCount: 1,
      },
    });
    await tx.dictationTermReport.create({ data: { termId: term.id, kineId } });
  });

  // Jamais le terme dans les logs : c'est du texte dicté par le kiné
  logger.info(`Signalement de terme : bilan ${bilanId}`);
  return { success: true };
}

const STATUTS = ['NOUVEAU', 'RETENU', 'ECARTE'];
const CACHE_TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, terms: null };

/**
 * Correspondances retenues, pour la passe de correction : `{ heard, expected }`.
 *
 * La forme entendue compte autant que la forme attendue. Le vocabulaire seul dit au modèle qu'un
 * terme existe et le laisse deviner d'où vient la faute ; la paire lui donne la correspondance
 * observée, pour les écorchages qu'il ne rapprocherait pas tout seul.
 *
 * Cache de 5 minutes : sur plusieurs instances, c'est le délai de propagation d'une validation
 * en admin.
 *
 * Ne lève jamais : la correction a un contrat de dégradation propre (au pire, le texte brut), une
 * base indisponible ne doit pas faire échouer une dictée.
 */
async function listRetained() {
  if (cache.terms && Date.now() - cache.at < CACHE_TTL_MS) return cache.terms;
  try {
    const prisma = prismaService.getInstance();
    const rows = await prisma.dictationTerm.findMany({ where: { statut: 'RETENU' }, select: { heard: true, expected: true } });
    cache = { at: Date.now(), terms: rows.map((r) => ({ heard: r.heard, expected: r.expected })) };
  } catch (err) {
    logger.warn(`Vocabulaire signalé : lecture impossible (${err?.message})`);
    // Pas de nouvelle tentative avant le prochain TTL : sans ça, une base indisponible déclenche
    // une requête et un avertissement par segment de chaque dictée.
    cache = { at: Date.now(), terms: cache.terms ?? [] };
    return cache.terms;
  }
  return cache.terms;
}

function invalidateCache() { cache = { at: 0, terms: null }; }

/** Liste admin : NOUVEAU d'abord, puis les plus signalés. `statut` est optionnel. */
async function adminList({ statut }) {
  const prisma = prismaService.getInstance();
  const rows = await prisma.dictationTerm.findMany({
    where: statut ? { statut } : {},
    orderBy: [{ statut: 'asc' }, { reportCount: 'desc' }],
    select: {
      id: true, heard: true, expected: true, correctorOutput: true, statut: true, reportCount: true, lastReportedAt: true,
      reports: { distinct: ['kineId'], select: { kineId: true } },
    },
  });
  // Kinés distincts, pas lignes de provenance : c'est ce chiffre qui distingue la prononciation
  // d'un seul kiné d'un trou de vocabulaire partagé, et c'est sur lui que l'arbitrage se fait.
  return rows.map(({ reports, ...r }) => ({ ...r, kineCount: reports.length }));
}

/**
 * Corrige une paire depuis l'admin. Sert surtout à rogner une sélection trop large : un kiné qui
 * signale « de la saigue » produit une correspondance trop spécifique, qui ne se déclencherait
 * presque jamais.
 *
 * Rogner fait justement converger les variantes vers une paire qui existe déjà : on fusionne alors
 * plutôt que de refuser. Les signalements rejoignent la ligne cible, les compteurs s'additionnent,
 * le doublon disparaît — le nombre de kinés distincts se recalcule seul, il se lit des lignes de
 * provenance.
 *
 * La garde d'identité ne tourne pas ici : elle a besoin du patient du bilan, et à ce stade il n'y
 * a plus de bilan. C'est l'admin qui édite, sous sa responsabilité.
 */
async function adminEdit({ id, heard, expected }) {
  const prisma = prismaService.getInstance();
  const current = await prisma.dictationTerm.findUnique({ where: { id } });
  if (!current) throw new DraftError('TERM_NOT_FOUND', 404, 'Terme introuvable');

  const clean = validateTerm({ heard: heard ?? current.heard, expected: expected ?? current.expected });
  const unchanged = clean.heardNorm === current.heardNorm && clean.expectedNorm === current.expectedNorm;
  const target = unchanged ? null : await prisma.dictationTerm.findUnique({
    where: { heardNorm_expectedNorm: { heardNorm: clean.heardNorm, expectedNorm: clean.expectedNorm } },
  });

  let term;
  if (target && target.id !== id) {
    term = await prisma.$transaction(async (tx) => {
      await tx.dictationTermReport.updateMany({ where: { termId: id }, data: { termId: target.id } });
      const merged = await tx.dictationTerm.update({
        where: { id: target.id },
        data: {
          reportCount: target.reportCount + current.reportCount,
          lastReportedAt: current.lastReportedAt > target.lastReportedAt ? current.lastReportedAt : target.lastReportedAt,
        },
      });
      await tx.dictationTerm.delete({ where: { id } });
      return merged;
    });
    logger.info(`Vocabulaire signalé : terme ${id} fusionné dans ${target.id}`);
  } else {
    term = await prisma.dictationTerm.update({
      where: { id },
      data: { heard: clean.heard, expected: clean.expected, heardNorm: clean.heardNorm, expectedNorm: clean.expectedNorm },
    });
    logger.info(`Vocabulaire signalé : terme ${id} corrigé`);
  }
  // Éditer un terme déjà retenu doit prendre effet tout de suite, comme un changement de statut
  invalidateCache();
  return term;
}

async function adminSetStatut({ id, statut }) {
  const prisma = prismaService.getInstance();
  const term = await prisma.dictationTerm.update({ where: { id }, data: { statut }, select: { id: true, statut: true } });
  // La promesse faite en admin est « effet immédiat » : le cache doit tomber tout de suite
  invalidateCache();
  logger.info(`Vocabulaire signalé : terme ${id} passé en ${statut}`);
  return term;
}

module.exports = {
  MAX_CHARS, MAX_WORDS, normalizeTerm, validateTerm, assertNoIdentity, report,
  STATUTS, listRetained, invalidateCache, adminList, adminEdit, adminSetStatut,
};
