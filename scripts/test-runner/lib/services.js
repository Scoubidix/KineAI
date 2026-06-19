const net = require('net');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const { ROOT, BACKEND_DIR, FRONTEND_DIR } = require('./paths');

// Teste si un port TCP accepte une connexion.
function isPortOpen(port, host = '127.0.0.1', timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (ok) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

// GET une URL, renvoie true si statut 2xx.
function httpOk(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 300);
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

// Attend que `check()` renvoie true, en boucle, jusqu'au timeout.
async function waitFor(check, { timeoutMs = 60000, intervalMs = 1000, label = 'service', onLog } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) {
      if (onLog) onLog(`[ok] ${label} prêt`);
      return;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timeout: ${label} n'est pas prêt après ${Math.round(timeoutMs / 1000)}s`);
}

// Lance une commande en process détaché (survit à la fermeture de l'UI).
function spawnDetached(command, args, cwd, onLog) {
  const child = spawn(command, args, { cwd, shell: true, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = (chunk) => { if (onLog) chunk.toString().split(/\r?\n/).forEach((l) => l && onLog(l)); };
  child.stdout.on('data', log);
  child.stderr.on('data', log);
  child.unref();
  return child;
}

// S'assure que les 4 services e2e tournent ; démarre seulement les absents ; n'arrête jamais.
async function ensureServices({ onLog } = {}) {
  // 1. DB Docker (:5433)
  if (await isPortOpen(5433)) {
    if (onLog) onLog('[skip] DB Docker déjà sur :5433');
  } else {
    if (onLog) onLog('> docker compose up -d');
    spawnDetached('docker', ['compose', 'up', '-d'], ROOT, onLog);
    await waitFor(() => isPortOpen(5433), { label: 'DB Docker (:5433)', onLog });
  }

  // 2. Backend (:3000/health)
  if (await httpOk('http://localhost:3000/health')) {
    if (onLog) onLog('[skip] Backend déjà sur :3000');
  } else {
    if (onLog) onLog('> node index.js (backend)');
    spawnDetached('node', ['index.js'], BACKEND_DIR, onLog);
    await waitFor(() => httpOk('http://localhost:3000/health'), { label: 'Backend (:3000/health)', onLog });
  }

  // 3. Frontend (:3001) — port e2e imposé, PAS le npm run dev par défaut
  if (await isPortOpen(3001)) {
    if (onLog) onLog('[skip] Frontend déjà sur :3001');
  } else {
    if (onLog) onLog('> npx next dev -p 3001 (frontend)');
    spawnDetached('npx', ['next', 'dev', '-p', '3001'], FRONTEND_DIR, onLog);
    await waitFor(() => isPortOpen(3001), { label: 'Frontend (:3001)', timeoutMs: 90000, onLog });
  }

  // 4. stripe listen — pas de port à sonder : on le démarre et on attend la ligne "Ready".
  //    Idempotence best-effort via tasklist (Windows). Si déjà lancé, on ne double pas.
  const stripeRunning = await isStripeRunning();
  if (stripeRunning) {
    if (onLog) onLog('[skip] stripe listen déjà actif');
  } else {
    if (onLog) onLog('> stripe listen (via scripts/e2e-stripe-listen.ps1)');
    await startStripeListen(onLog);
  }
}

// Détecte un process stripe via tasklist (Windows).
function isStripeRunning() {
  return new Promise((resolve) => {
    const child = spawn('tasklist', ['/FI', 'IMAGENAME eq stripe.exe', '/NH'], { shell: true });
    let out = '';
    child.stdout.on('data', (c) => { out += c.toString(); });
    child.on('error', () => resolve(false));
    child.on('close', () => resolve(/stripe\.exe/i.test(out)));
  });
}

// Lance le script PowerShell stripe listen et résout quand "Ready" apparaît (ou timeout).
function startStripeListen(onLog) {
  return new Promise((resolve, reject) => {
    const script = path.join(ROOT, 'scripts', 'e2e-stripe-listen.ps1');
    const child = spawn('powershell', ['-ExecutionPolicy', 'Bypass', '-File', script], {
      cwd: ROOT, shell: true, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let settled = false;
    const finish = (fn, arg) => { if (!settled) { settled = true; child.unref(); fn(arg); } };
    const handle = (chunk) => {
      const text = chunk.toString();
      text.split(/\r?\n/).forEach((l) => l && onLog && onLog(l));
      if (/Ready/i.test(text)) finish(resolve);
    };
    child.stdout.on('data', handle);
    child.stderr.on('data', handle);
    child.on('error', (e) => finish(reject, e));
    // Fallback : stripe listen affiche "Ready" très vite. Si on ne l'a pas vu après 15s,
    // on continue quand même mais on prévient — c'est le symptôme classique d'un mauvais
    // STRIPE_SECRET_KEY ou whsec (cf. pièges connus). Mieux vaut un test e2e qui échoue avec
    // un indice qu'un blocage silencieux.
    setTimeout(() => {
      if (!settled && onLog) {
        onLog('[avertissement] stripe listen : "Ready" non détecté après 15s — je continue. ' +
          'Si le webhook échoue, vérifier STRIPE_SECRET_KEY (sk_test_) et STRIPE_ENDPOINT_SECRET (whsec) dans backend/.env.');
      }
      finish(resolve);
    }, 15000);
  });
}

module.exports = { isPortOpen, httpOk, waitFor, ensureServices };
