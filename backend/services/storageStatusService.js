// services/storageStatusService.js — Comparaison GCS/Cellar pour l'onglet admin Stockage
//
// Lecture seule : liste les deux stockages par dossier et compte les chemins
// enregistrés en URL complète (doit valoir 0 en prod avant la bascule).
// Aperçu rapide (présence + taille) : `rclone check` reste la vérification qui fait foi.
// ⚠️ Temporaire : à retirer au ménage GCS.
const prismaService = require('./prismaService');
const storage = require('./storage');
const {
  EXERCICES_FOLDER, AVATARS_FOLDER, CONTRACTS_FOLDER, SUPPORT_FOLDER, NOUVEAUTES_FOLDER, PIONNIERS_FOLDER,
} = require('./gcsStorageService');

const FOLDERS = [EXERCICES_FOLDER, AVATARS_FOLDER, CONTRACTS_FOLDER, SUPPORT_FOLDER, NOUVEAUTES_FOLDER, PIONNIERS_FOLDER];
const SAMPLE_SIZE = 20;

const summarize = (objects) => ({ count: objects.length, bytes: objects.reduce((sum, o) => sum + o.size, 0) });
const sample = (keys) => ({ count: keys.length, sample: keys.slice(0, SAMPLE_SIZE) });

async function compareFolder(folder, gcsDriver, cellarDriver) {
  const [gcsObjects, cellarObjects] = await Promise.all([
    gcsDriver.list(folder),
    cellarDriver ? cellarDriver.list(folder) : Promise.resolve(null),
  ]);

  if (!cellarObjects) {
    return { folder, gcs: summarize(gcsObjects), cellar: null, missingOnCellar: null, sizeMismatch: null };
  }

  const cellarSizes = new Map(cellarObjects.map((o) => [o.key, o.size]));
  const missing = gcsObjects.filter((o) => !cellarSizes.has(o.key)).map((o) => o.key);
  const mismatched = gcsObjects
    .filter((o) => cellarSizes.has(o.key) && cellarSizes.get(o.key) !== o.size)
    .map((o) => o.key);

  return {
    folder,
    gcs: summarize(gcsObjects),
    cellar: summarize(cellarObjects),
    missingOnCellar: sample(missing),
    sizeMismatch: sample(mismatched),
  };
}

/**
 * Chemins de fichiers enregistrés en URL complète au lieu d'une clé (données anciennes).
 * `ExerciceModele.gifUrl` (ancienne URL Firebase) n'est pas compté : plus aucun code
 * ne le lit, il ne bloque donc pas la migration.
 */
async function countFullUrlValues() {
  const prisma = prismaService.getInstance();
  const http = { startsWith: 'http' };
  const [avatar, gifPath, videoPath, posterPath, ticket, contract, pionnier, nouveautes] = await Promise.all([
    prisma.kine.count({ where: { avatarPath: http } }),
    prisma.exerciceModele.count({ where: { gifPath: http } }),
    prisma.exerciceModele.count({ where: { videoPath: http } }),
    prisma.exerciceModele.count({ where: { posterPath: http } }),
    prisma.ticketMessage.count({ where: { imagePath: http } }),
    prisma.contract.count({ where: { pdfFinalUrl: http } }),
    prisma.pionnierMessage.count({ where: { imagePath: http } }),
    // Tableau de chaînes : Prisma ne filtre pas un élément par préfixe, la table est petite.
    prisma.nouveaute.findMany({ select: { imagePaths: true } }),
  ]);

  const byColumn = {
    'Kine.avatarPath': avatar,
    'ExerciceModele.gifPath': gifPath,
    'ExerciceModele.videoPath': videoPath,
    'ExerciceModele.posterPath': posterPath,
    'TicketMessage.imagePath': ticket,
    'Contract.pdfFinalUrl': contract,
    'PionnierMessage.imagePath': pionnier,
    'Nouveaute.imagePaths': nouveautes.flatMap((n) => n.imagePaths).filter((p) => p.startsWith('http')).length,
  };
  return { total: Object.values(byColumn).reduce((sum, n) => sum + n, 0), byColumn };
}

async function getStorageStatus() {
  const config = storage.readConfig();
  const gcsDriver = storage.getDriver('gcs');
  const cellarDriver = storage.getDriver('cellar');

  const [folders, fullUrlValues] = await Promise.all([
    Promise.all(FOLDERS.map((folder) => compareFolder(folder, gcsDriver, cellarDriver))),
    countFullUrlValues(),
  ]);

  return { activeProvider: config.provider, cellarConfigured: Boolean(config.cellar), folders, fullUrlValues };
}

module.exports = { getStorageStatus };
