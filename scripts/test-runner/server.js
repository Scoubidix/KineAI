const http = require('http');
const fs = require('fs');
const path = require('path');
const { runJest } = require('./lib/jest');
const { runPlaywright } = require('./lib/playwright');
const { ensureServices } = require('./lib/services');

const PORT = 4500;
const INDEX_HTML = path.join(__dirname, 'public', 'index.html');

let running = false;
const clients = new Set(); // réponses SSE ouvertes

// Diffuse un event SSE à tous les clients connectés.
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  // Ne pas écrire sur un client déjà déconnecté (fenêtre étroite entre 'close' et le nettoyage du Set).
  for (const res of clients) if (!res.writableEnded) res.write(payload);
}

const log = (line) => broadcast('log', line);

function counts(results) {
  return {
    passed: results.filter((r) => r.status === 'passed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
  };
}

// Exécute la cible demandée et diffuse le récap.
async function runTarget(target) {
  let results = [];
  try {
    if (target === 'jest' || target === 'all') {
      log('=== Jest (backend) ===');
      results = results.concat(await runJest({ onLog: log }));
    }
    if (target === 'e2e' || target === 'all') {
      log('=== Services e2e ===');
      await ensureServices({ onLog: log });
      log('=== Playwright (e2e) ===');
      results = results.concat(await runPlaywright({ onLog: log }));
    }
    broadcast('summary', { target, results, counts: counts(results) });
  } catch (e) {
    log('[ERREUR] ' + e.message);
    broadcast('error', { message: e.message });
  } finally {
    running = false;
    broadcast('done', {});
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', (c) => { b += c; });
    req.on('end', () => resolve(b));
    req.on('error', reject); // évite un handler bloqué si le client coupe en cours d'envoi
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    fs.readFile(INDEX_HTML, (err, data) => {
      if (err) { res.writeHead(500); return res.end('index.html introuvable'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('event: connected\ndata: {}\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (req.method === 'POST' && req.url === '/run') {
    const body = await readBody(req);
    let target;
    try { target = JSON.parse(body).target; } catch (_) { target = null; }
    if (!['all', 'jest', 'e2e'].includes(target)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'target invalide' }));
    }
    if (running) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'un run est déjà en cours' }));
    }
    running = true;
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ started: target }));
    runTarget(target); // async, sans await
    return;
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`Test Runner UI sur http://localhost:${PORT}`);
});
