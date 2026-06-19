// Retire les codes couleur ANSI des messages d'erreur (Jest/Playwright en colorisent).
function stripAnsi(str) {
  if (!str) return '';
  // eslint-disable-next-line no-control-regex
  // Retire les codes couleur ANSI (séquences ESC[…m) des messages d'erreur.
  return String(str).replace(/\x1b\[[0-9;]*m/g, '');
}

module.exports = { stripAnsi };
