// services/storage/index.js — Choix du pilote de stockage (STORAGE_PROVIDER=gcs|cellar)
//
// Le pilote actif sert toute l'application. Les deux pilotes restent accessibles
// pour la comparaison admin (storageStatusService). Le changement de fournisseur
// passe par la variable d'environnement et un redémarrage, jamais à chaud.
// Spec : docs/superpowers/specs/2026-10-03-migration-cellar-design.md
const { createGcsDriver } = require('./gcsDriver');
const { createCellarDriver } = require('./cellarDriver');

const PROVIDERS = ['gcs', 'cellar'];
const CELLAR_VARS = ['CELLAR_ADDON_HOST', 'CELLAR_ADDON_KEY_ID', 'CELLAR_ADDON_KEY_SECRET', 'CELLAR_BUCKET'];

/** Lit et valide la configuration. Lève une Error si elle est invalide (refus de démarrer). */
function readConfig(env = process.env) {
  const provider = env.STORAGE_PROVIDER || 'gcs';
  if (!PROVIDERS.includes(provider)) {
    throw new Error(`STORAGE_PROVIDER inconnu : "${provider}" (valeurs acceptées : ${PROVIDERS.join(', ')})`);
  }

  const missing = CELLAR_VARS.filter((name) => !env[name]);
  if (provider === 'cellar' && missing.length > 0) {
    throw new Error(`STORAGE_PROVIDER=cellar mais variables Cellar manquantes : ${missing.join(', ')}`);
  }

  return {
    provider,
    gcs: { bucketName: env.GCS_BUCKET_NAME || 'monassistantkine' },
    cellar: missing.length === 0
      ? {
        host: env.CELLAR_ADDON_HOST,
        keyId: env.CELLAR_ADDON_KEY_ID,
        keySecret: env.CELLAR_ADDON_KEY_SECRET,
        bucket: env.CELLAR_BUCKET,
      }
      : null,
  };
}

const drivers = {};

/** Pilote par nom, créé une seule fois. `null` pour Cellar s'il n'est pas configuré. */
function getDriver(name) {
  if (!(name in drivers)) {
    const config = readConfig();
    if (name === 'gcs') drivers.gcs = createGcsDriver(config.gcs);
    else if (name === 'cellar') drivers.cellar = config.cellar ? createCellarDriver(config.cellar) : null;
    else throw new Error(`Pilote de stockage inconnu : ${name}`);
  }
  return drivers[name];
}

/** Pilote utilisé par toute l'application. */
function activeStorage() {
  return getDriver(readConfig().provider);
}

module.exports = { readConfig, getDriver, activeStorage, PROVIDERS };
