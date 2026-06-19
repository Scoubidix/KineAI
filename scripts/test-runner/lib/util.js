// Retire les codes couleur ANSI des messages d'erreur (Jest/Playwright en colorisent).
function stripAnsi(str) {
  if (!str) return '';
  // eslint-disable-next-line no-control-regex
  return String(str).replace(/\[[0-9;]*m/g, '');
}

module.exports = { stripAnsi };
