// utils/youtube.js — Lecture d'un lien YouTube collé par l'admin : identifiant vidéo + seconde de départ.
// Même règles que frontend/src/utils/youtube.ts (retour immédiat à la saisie) ; le backend fait foi.
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com']);
const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const PATH_PREFIXES = ['/shorts/', '/embed/', '/live/'];

/** « 90 », « 90s », « 1m30s », « 1h2m3s » → secondes ; illisible → null. */
function parseStart(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase();
  if (/^\d+s?$/.test(s)) return parseInt(s, 10);
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

/**
 * @param {string} input - lien tel que collé (watch, youtu.be, shorts, embed, live)
 * @returns {{ id: string, start: number|null } | null} null si le lien n'est pas une vidéo YouTube reconnue
 */
function parseYouTubeUrl(input) {
  let url;
  try {
    url = new URL(String(input ?? '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;

  let id = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (url.pathname === '/watch') id = url.searchParams.get('v');
  else {
    const prefix = PATH_PREFIXES.find((p) => url.pathname.startsWith(p));
    if (prefix) id = url.pathname.slice(prefix.length).split('/')[0];
  }
  if (!id || !ID_RE.test(id)) return null;

  const start = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start'));
  return { id, start: start > 0 ? start : null };
}

module.exports = { parseYouTubeUrl };
