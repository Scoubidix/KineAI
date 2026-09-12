// Journal de développement de la pseudonymisation : imprime le texte MASQUÉ tel qu'il part au modèle
// (jamais l'original, jamais la table de correspondance) avec le compte des jetons, pour vérifier à
// l'œil ce qui sort du serveur. Opt-in (PSEUDONYM_DEBUG=1) et jamais en production : le texte masqué
// reste une donnée de santé, la règle « aucun texte de dictée dans les logs » vaut partout ailleurs.
const logger = require('./logger');

const enabled = () => process.env.PSEUDONYM_DEBUG === '1' && process.env.NODE_ENV !== 'production';

/**
 * @param {string} label - étape (« correction », « extraction », « rédaction »)
 * @param {string} masked - texte masqué envoyé au modèle
 * @param {{ stats: () => object }|null|undefined} pseudo - pseudonymiseur de l'appel, ou rien
 */
function logMasked(label, masked, pseudo) {
  if (!enabled()) return;
  const stats = pseudo ? Object.entries(pseudo.stats()).map(([type, n]) => `${type} ×${n}`).join(', ') || 'aucun' : 'sans pseudonymiseur';
  logger.debug(`[pseudonymisation] ${label} — jetons : ${stats}\n${masked}`);
}

module.exports = { logMasked };
