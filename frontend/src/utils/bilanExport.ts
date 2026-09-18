import DOMPurify from 'dompurify';
import { fetchWithAuth } from '@/utils/fetchWithAuth';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface RenderOptions {
  evolution?: boolean;
}

const query = (o?: RenderOptions) => (o?.evolution ? '?evolution=1' : '');

export interface BilanRender {
  html: string;
  title: string;
  css: string;
  examenHtml: string;
}

/** HTML rendu par le moteur serveur (à passer dans DOMPurify avant affichage). */
export async function fetchBilanRender(bilanId: number, options?: RenderOptions): Promise<BilanRender> {
  const res = await fetchWithAuth(`${API}/api/bilans/${bilanId}/render${query(options)}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Rendu du bilan impossible');
  return { html: json.html, title: json.title, css: json.css, examenHtml: json.examenHtml ?? '' };
}

export interface BilanClipboard {
  /** Document autonome à écrire en `text/html` (styles inline : Word, Docs, Outlook) */
  html: string;
  /** Même contenu en texte brut, repli pour les champs qui ne prennent pas de HTML */
  text: string;
}

const CLIPBOARD_SOURCE = 'Bilan réalisé sur Mon Assistant Kiné';

/**
 * Styles appliqués en inline sur le HTML copié. Le moteur d'import HTML de Word ignore une
 * grande partie d'une feuille `<style>` (et toute la mise en page moderne) : seul l'attribut
 * `style` d'une balise est respecté partout — c'est la règle du HTML d'e-mail. Les règles sont
 * appliquées dans l'ordre : une règle plus tardive écrase la propriété d'une précédente.
 */
const CLIPBOARD_STYLES: Array<[string, string]> = [
  ['article.bilan', 'font-family:"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.5;color:#111'],
  ['.bilan-title', 'text-align:center;font-size:14pt;font-weight:700;margin:12pt 0 4pt'],
  ['.bilan-patient', 'text-align:center;font-size:10.5pt;color:#444;margin-bottom:10pt'],
  ['.bilan-h2', 'font-size:10.5pt;font-weight:700;color:#3899aa;border-bottom:1px solid #d9e2e5;padding-bottom:2pt;margin:14pt 0 6pt'],
  ['.bilan-cat', 'font-size:10.5pt;font-weight:700;margin:8pt 0 3pt'],
  ['p', 'margin:0 0 6pt;text-align:justify'],
  ['.bilan-observations', 'font-style:italic'],
  ['table', 'width:100%;border-collapse:collapse;font-size:10pt;margin:0 0 8pt'],
  ['th, td', 'border:1px solid #cfd8db;padding:3pt 6pt;text-align:left;vertical-align:top'],
  ['th', 'background-color:#eef5f7;font-weight:600'],
  ['th.bilan-side, td.bilan-val', 'text-align:center'],
  ['.bilan-sign', 'margin-top:24pt;text-align:right;font-size:10pt'],
  ['.bilan-source', 'font-size:9pt;color:#777;margin:14pt 0 0'],
];

/**
 * Un tableau de mesures en lignes de texte : « Flexion de genou : D 110° · G 120° ».
 * Les tabulations d'un tableau collé dans un champ texte ne s'alignent sur rien ; on reprend
 * donc l'intitulé de colonne devant chaque valeur. « Valeur » (colonne unique) et les cellules
 * fusionnées n'ont pas d'intitulé utile : la mesure se suffit à elle-même.
 */
function tableToLines(table: Element): string[] {
  const heads = Array.from(table.querySelectorAll('thead th')).map((th) => (th.textContent || '').trim());
  return Array.from(table.querySelectorAll('tbody tr')).map((tr) => {
    const cells = Array.from(tr.children) as HTMLTableCellElement[];
    if (cells.length === 0) return '';
    const label = (cells[0].textContent || '').trim();
    const values = cells.slice(1).map((td, i) => {
      const value = (td.textContent || '').trim() || '—';
      const head = heads[i + 1] || '';
      return head && head !== 'Valeur' && (td.colSpan || 1) < 2 ? `${head} ${value}` : value;
    });
    return values.length ? `${label} : ${values.join(' · ')}` : label;
  }).filter(Boolean);
}

/** Texte brut d'un document déjà préparé : balises retirées, lignes vides compressées. */
function domToText(doc: Document): string {
  doc.querySelectorAll('table').forEach((table) => {
    const holder = doc.createElement('div');
    holder.textContent = `${tableToLines(table).join('\n')}\n`;
    table.replaceWith(holder);
  });
  doc.querySelectorAll('h1, h2, h3, p, div.bilan-sign, div.bilan-source, div.bilan-patient').forEach((el) => el.append('\n'));
  return (doc.body.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Prépare le bilan pour le presse-papiers et le corps de mail, dans les deux saveurs.
 * L'en-tête du document (identité du kiné, logo, date) est retiré : le kiné colle le bilan dans
 * son propre courrier ou son propre modèle, qui portent déjà son identité. Une ligne de source
 * ferme le document.
 */
export function buildBilanClipboard(html: string): BilanClipboard {
  const doc = new DOMParser().parseFromString(DOMPurify.sanitize(html), 'text/html');
  const root = doc.querySelector('article.bilan') || doc.body;

  doc.querySelectorAll('header.bilan-header').forEach((el) => el.remove());
  const source = doc.createElement('div');
  source.className = 'bilan-source';
  source.textContent = CLIPBOARD_SOURCE;
  root.append(source);

  // `text-transform` n'est pas repris à l'import : les titres de section sont mis en capitales ici
  doc.querySelectorAll('.bilan-h2').forEach((el) => { el.textContent = (el.textContent || '').toUpperCase(); });
  for (const [selector, style] of CLIPBOARD_STYLES) {
    doc.querySelectorAll(selector).forEach((el) => {
      const current = el.getAttribute('style');
      el.setAttribute('style', current ? `${current};${style}` : style);
    });
  }

  const body = doc.body.innerHTML;
  return {
    html: `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head><body>${body}</body></html>`,
    text: domToText(doc),
  };
}

/**
 * Écrit le bilan dans le presse-papiers en deux saveurs : `text/html` (Word, Google Docs,
 * Outlook, LibreOffice collent du texte mis en forme) et `text/plain` (tout le reste).
 * `payload` est une Promise et non une valeur : Safari consomme le geste utilisateur au premier
 * `await`, le `ClipboardItem` doit donc être construit dès le clic, sinon l'écriture est refusée.
 * Repli sur le texte brut si l'écriture riche est indisponible ou refusée.
 */
export function writeBilanToClipboard(payload: Promise<BilanClipboard>): Promise<void> {
  const plain = () => payload.then((p) => navigator.clipboard.writeText(p.text));
  if (typeof ClipboardItem === 'undefined' || typeof navigator.clipboard?.write !== 'function') return plain();
  const part = (key: keyof BilanClipboard, type: string) => payload.then((p) => new Blob([p[key]], { type }));
  return navigator.clipboard
    .write([new ClipboardItem({ 'text/html': part('html', 'text/html'), 'text/plain': part('text', 'text/plain') })])
    .catch(plain);
}

/** Repli quand le PDF serveur est indisponible : fenêtre d'impression du HTML rendu. */
export function printBilanHtml(html: string, title: string): { success: boolean; error?: string } {
  const w = window.open('', '_blank');
  if (!w) return { success: false, error: 'Autorise les fenêtres pop-up pour imprimer le bilan' };
  // Le HTML peut contenir du contenu utilisateur (bilan hérité) : à sanitizer par l'appelant avant impression
  w.document.write(html);
  w.document.close();
  w.document.title = title;
  setTimeout(() => { w.focus(); w.print(); }, 250);
  return { success: true };
}

/**
 * Ouvre le PDF serveur dans un nouvel onglet. Sur 503 (Puppeteer désactivé),
 * bascule sur l'impression navigateur du document complet.
 */
export async function downloadBilanPdf(bilanId: number, options?: RenderOptions): Promise<{ success: boolean; error?: string }> {
  const res = await fetchWithAuth(`${API}/api/bilans/${bilanId}/pdf${query(options)}`);
  if (res.ok) {
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) return { success: false, error: 'Autorise les fenêtres pop-up pour ouvrir le PDF' };
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { success: true };
  }
  if (res.status === 503) {
    // Puppeteer désactivé sur cet environnement : impression navigateur du même document
    let render: BilanRender;
    try { render = await fetchBilanRender(bilanId, options); } catch (e) { return { success: false, error: (e as Error).message }; }
    const safeBody = DOMPurify.sanitize(render.html);
    const full = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${render.title.replace(/</g, '&lt;')}</title><style>${render.css}</style></head><body>${safeBody}</body></html>`;
    return printBilanHtml(full, render.title);
  }
  let error = 'Génération du PDF impossible';
  try { error = (await res.json()).error || error; } catch { /* corps non JSON */ }
  return { success: false, error };
}
