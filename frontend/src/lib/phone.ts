// Validation "mobile français" — même règle que le backend (services/phoneUtils.js).
// Utilisé partout où un numéro doit pouvoir recevoir un envoi WhatsApp (visio, programme, modal contact).
export function isMobileFR(phone: string | null | undefined): boolean {
  if (!phone) return false;
  // Supprimer espaces, points, tirets
  let n = phone.replace(/[\s.\-]/g, '');
  // Normaliser +33 → 0 et 0033 → 0
  if (n.startsWith('+33')) n = '0' + n.slice(3);
  if (n.startsWith('0033')) n = '0' + n.slice(4);
  return /^0[67]\d{8}$/.test(n);
}
