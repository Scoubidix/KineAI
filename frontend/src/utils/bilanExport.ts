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
}

/** HTML rendu par le moteur serveur (à passer dans DOMPurify avant affichage). */
export async function fetchBilanRender(bilanId: number, options?: RenderOptions): Promise<BilanRender> {
  const res = await fetchWithAuth(`${API}/api/bilans/${bilanId}/render${query(options)}`);
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.error || 'Rendu du bilan impossible');
  return { html: json.html, title: json.title, css: json.css };
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
