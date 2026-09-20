// utils/parisDate.js
// Helpers de date en heure murale Europe/Paris. Fonctions pures, sans dépendance.
// Extraits de adminStatsService pour être partagés avec asrMonitoringService.

const PARIS_TZ = 'Europe/Paris';

/**
 * Instant UTC correspondant à minuit (heure murale Paris) d'une date calendaire.
 * Calcule l'offset Paris pour cette date précise → gère l'heure d'été.
 */
function parisMidnightUtc(year, month /* 1-12 */, day) {
  const naiveUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: PARIS_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(naiveUtc)).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = Number(p.value);
    return acc;
  }, {});
  const hour = parts.hour === 24 ? 0 : parts.hour; // certaines plateformes rendent minuit en "24"
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hour, parts.minute, parts.second);
  const offset = wallAsUtc - naiveUtc;
  return new Date(naiveUtc - offset);
}

/** Date calendaire {year, month, day} d'un instant, en heure Paris. */
function parisYmd(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = Number(p.value);
    return acc;
  }, {});
  return { year: parts.year, month: parts.month, day: parts.day };
}

/** Jour de la semaine Paris : 1 = lundi ... 7 = dimanche. */
function parisWeekday(date) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: PARIS_TZ, weekday: 'short' }).format(date);
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[wd];
}

/** Ajoute n jours à une date calendaire {year, month, day}. */
function addDays(ymd, n) {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day));
  d.setUTCDate(d.getUTCDate() + n);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Clé de regroupement journalier 'YYYY-MM-DD' en heure de Paris. */
function parisDayKey(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PARIS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

module.exports = { PARIS_TZ, parisMidnightUtc, parisYmd, parisWeekday, addDays, parisDayKey };
