// Lecture d'un lien YouTube : mêmes règles que backend/utils/youtube.js (le backend fait foi).
// Sert au retour immédiat dans l'admin (lien reconnu ou non) et à construire les URL du lecteur.
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com']);
const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const PATH_PREFIXES = ['/shorts/', '/embed/', '/live/'];

function parseStart(raw: string | null): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (/^\d+s?$/.test(s)) return parseInt(s, 10);
  const m = s.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
}

export function parseYouTubeUrl(input: string): { id: string; start: number | null } | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;

  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
  else if (url.pathname === '/watch') id = url.searchParams.get('v');
  else {
    const prefix = PATH_PREFIXES.find((p) => url.pathname.startsWith(p));
    if (prefix) id = url.pathname.slice(prefix.length).split('/')[0];
  }
  if (!id || !ID_RE.test(id)) return null;

  const start = parseStart(url.searchParams.get('t') ?? url.searchParams.get('start'));
  return { id, start: start && start > 0 ? start : null };
}

/** Lecteur en mode confidentialité renforcée, lancé au clic (autoplay), vidéos suggérées de la même chaîne. */
export const youtubeEmbedUrl = (id: string, start: number | null): string =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0${start ? `&start=${start}` : ''}`;

export const youtubeThumbnailUrl = (id: string): string => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** Lien canonique réaffiché dans le champ de l'admin à la réouverture d'une fiche. */
export const youtubeWatchUrl = (id: string, start: number | null): string =>
  `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}`;

/** 90 → « 1:30 », 3723 → « 1:02:03 ». */
export function formatStart(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
