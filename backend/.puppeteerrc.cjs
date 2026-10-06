const { join } = require('path');

// Chrome téléchargé dans le dossier de l'app (et non ~/.cache) : il fait ainsi partie du cache
// de build Clever Cloud, sinon une instance restaurée depuis ce cache démarre sans navigateur.
module.exports = { cacheDirectory: join(__dirname, '.cache', 'puppeteer') };
