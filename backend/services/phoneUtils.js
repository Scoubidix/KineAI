/**
 * Détection d'un numéro mobile français.
 * Accepte 06/07, +336/+337, 00336/7, avec espaces/points/tirets.
 */
function isMobileFR(phone) {
  if (!phone || typeof phone !== 'string') return false;
  // Retirer espaces, points, tirets
  const cleaned = phone.replace(/[\s.\-]/g, '');
  // Normaliser le préfixe international vers 0
  let national = cleaned;
  if (national.startsWith('+33')) national = '0' + national.slice(3);
  else if (national.startsWith('0033')) national = '0' + national.slice(4);
  // Un mobile FR national = 0[67] suivi de 8 chiffres
  return /^0[67]\d{8}$/.test(national);
}

module.exports = { isMobileFR };
