// Échappe le HTML d'une saisie utilisateur avant injection dans un template
// (email transactionnel, PDF...). Échappe & < > " ' — à appliquer AVANT toute
// substitution volontaire (ex. \n -> <br>).
function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { escapeHtml };
