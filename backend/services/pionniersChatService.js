// services/pionniersChatService.js
// Logique metier du salon « Groupe Pionniers » : acces, lecture du fil, curseur de non-lus.
const prismaService = require('./prismaService');
const gcsStorageService = require('./gcsStorageService');
const { PIONNIERS_FOLDER, AVATARS_FOLDER } = require('./gcsStorageService');
const { getEffectivePlan } = require('./planService');
const { getAdminEmails } = require('../utils/adminEmails');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const EXCERPT_LENGTH = 120;
const FALLBACK_NAME = 'Membre Pionnier';

// Champs de l'auteur charges pour la serialisation. L'email sert uniquement a
// calculer isAdmin : il n'est JAMAIS renvoye au client.
const AUTHOR_SELECT = { id: true, firstName: true, lastName: true, email: true, avatarPath: true };

const MESSAGE_INCLUDE = {
  author: { select: AUTHOR_SELECT },
  replyTo: {
    select: {
      id: true,
      body: true,
      deletedAt: true,
      author: { select: { id: true, firstName: true, lastName: true } },
    },
  },
};

function displayName(person) {
  const name = [person?.firstName, person?.lastName].filter(Boolean).join(' ').trim();
  return name || FALLBACK_NAME;
}

function excerptOf(replyTo) {
  if (replyTo.deletedAt) return 'Message supprimé';
  const body = replyTo.body || '';
  return body.length > EXCERPT_LENGTH ? `${body.slice(0, EXCERPT_LENGTH)}…` : body;
}

/**
 * Signe une URL GCS au plus une fois par chemin distinct.
 * Une page de 50 messages ecrits par 6 personnes = 6 signatures d'avatar, pas 50.
 *
 * Le dossier attendu est TOUJOURS declare : generateSignedUrl refuse tout chemin
 * hors des prefixes autorises et renvoie null en silence (garde du commit 2fbe944).
 */
function createSignedUrlCache() {
  const cache = new Map();
  return (path, allowedPrefixes) => {
    if (!path) return Promise.resolve(null);
    if (!cache.has(path)) {
      cache.set(path, gcsStorageService.generateSignedUrl(path, undefined, 'v4', allowedPrefixes));
    }
    return cache.get(path);
  };
}

async function serializeMessages(rows) {
  const signUrl = createSignedUrlCache();
  const adminEmails = getAdminEmails();

  return Promise.all(rows.map(async (row) => ({
    id: row.id,
    body: row.body,
    imageUrl: await signUrl(row.imagePath, [PIONNIERS_FOLDER]),
    createdAt: row.createdAt,
    author: {
      id: row.author.id,
      displayName: displayName(row.author),
      avatarUrl: await signUrl(row.author.avatarPath, [AVATARS_FOLDER]),
      isAdmin: adminEmails.includes((row.author.email || '').toLowerCase()),
    },
    replyTo: row.replyTo
      ? {
          id: row.replyTo.id,
          displayName: displayName(row.replyTo.author),
          excerpt: excerptOf(row.replyTo),
        }
      : null,
  })));
}

/**
 * Resout l'acces au salon a partir d'un UID Firebase, sans lever d'erreur.
 * Utilise par l'endpoint /unread-count, ouvert a tous les kines authentifies.
 */
async function resolveAccess(uid) {
  const prisma = prismaService.getInstance();
  const kine = await prisma.kine.findUnique({
    where: { uid },
    select: { id: true, email: true, planType: true },
  });

  if (!kine) return { kineId: null, hasAccess: false, isAdmin: false };

  const isAdmin = getAdminEmails().includes(kine.email.toLowerCase());
  const hasAccess = isAdmin || getEffectivePlan(kine) === 'PIONNIER';
  return { kineId: kine.id, hasAccess, isAdmin };
}

/**
 * Une page du fil, toujours renvoyee par id croissant.
 * - after : les messages plus recents que cet id (polling)
 * - before : la page d'historique precedant cet id (scroll vers le haut)
 * - ni l'un ni l'autre : la derniere page
 */
async function listMessages({ before, after, limit } = {}) {
  const prisma = prismaService.getInstance();
  const take = Math.min(Number(limit) || DEFAULT_LIMIT, MAX_LIMIT);

  const where = { deletedAt: null };
  if (after) where.id = { gt: after };
  else if (before) where.id = { lt: before };

  const ascending = Boolean(after);
  const rows = await prisma.pionnierMessage.findMany({
    where,
    include: MESSAGE_INCLUDE,
    orderBy: { id: ascending ? 'asc' : 'desc' },
    take,
  });

  return serializeMessages(ascending ? rows : [...rows].reverse());
}

/** Curseur de lecture du kine (0 s'il n'a jamais lu). */
async function getCursor(kineId) {
  const prisma = prismaService.getInstance();
  const row = await prisma.pionnierRead.findUnique({ where: { kineId } });
  return row?.lastReadMessageId ?? 0;
}

/** Non-lus : messages posterieurs au curseur, hors supprimes et hors messages du kine lui-meme. */
async function getUnreadCount(kineId) {
  const prisma = prismaService.getInstance();
  const cursor = await getCursor(kineId);
  const where = { id: { gt: cursor }, deletedAt: null, authorId: { not: kineId } };

  const [count, first] = await Promise.all([
    prisma.pionnierMessage.count({ where }),
    prisma.pionnierMessage.findFirst({ where, orderBy: { id: 'asc' }, select: { id: true } }),
  ]);

  return { count, firstUnreadId: first?.id ?? null };
}

/**
 * Avance le curseur de lecture. Ne recule pas : un onglet reste ouvert sur un
 * etat ancien ne doit pas rallumer la pastille apres coup.
 *
 * Lecture-puis-ecriture non atomique : deux onglets qui s'entrelacent peuvent
 * faire reculer le curseur. Assume — le pire cas rallume une pastille, et un
 * GREATEST() en SQL brut serait disproportionne pour cet enjeu.
 */
async function setLastRead(kineId, messageId) {
  const prisma = prismaService.getInstance();
  const current = await getCursor(kineId);
  const next = Math.max(current, Number(messageId) || 0);

  await prisma.pionnierRead.upsert({
    where: { kineId },
    create: { kineId, lastReadMessageId: next },
    update: { lastReadMessageId: next },
  });

  return next;
}

module.exports = {
  resolveAccess,
  listMessages,
  getUnreadCount,
  setLastRead,
  MESSAGE_INCLUDE,
  serializeMessages,
};
