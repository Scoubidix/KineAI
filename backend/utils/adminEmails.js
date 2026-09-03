// utils/adminEmails.js
// Source unique de la liste ADMIN_EMAILS. Relue a chaque appel : la variable
// d'environnement est reaffectee par les tests.

/** @returns {string[]} emails administrateurs, normalises en minuscules */
function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

module.exports = { getAdminEmails };
