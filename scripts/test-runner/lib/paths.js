const path = require('path');
const os = require('os');

// Racine du repo : ce fichier est dans scripts/test-runner/lib/ → remonter de 3 niveaux.
const ROOT = path.resolve(__dirname, '..', '..', '..');

module.exports = {
  ROOT,
  BACKEND_DIR: path.join(ROOT, 'backend'),
  FRONTEND_DIR: path.join(ROOT, 'frontend'),
  TMP_DIR: os.tmpdir(),
};
