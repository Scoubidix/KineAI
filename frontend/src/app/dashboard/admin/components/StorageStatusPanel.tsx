'use client';

// Panneau admin temporaire : migration GCS → Cellar. Fournisseur actif, comparaison
// des deux stockages par dossier (présence + taille) et chemins enregistrés en URL
// complète. Lecture seule : `rclone check` reste la vérification qui fait foi.
// ⚠️ À supprimer, avec la route et le service backend, au ménage GCS.
import React, { useCallback, useEffect, useState } from 'react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Totals { count: number; bytes: number }
interface Sample { count: number; sample: string[] }
interface FolderStatus {
  folder: string;
  gcs: Totals;
  cellar: Totals | null;
  missingOnCellar: Sample | null;
  sizeMismatch: Sample | null;
}
interface StorageStatus {
  activeProvider: 'gcs' | 'cellar';
  cellarConfigured: boolean;
  folders: FolderStatus[];
  fullUrlValues: { total: number; byColumn: Record<string, number> };
}

const formatBytes = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} Go`
    : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} Mo`
      : `${Math.round(bytes / 1024)} Ko`;

const ALERT = 'text-amber-700 dark:text-amber-300 font-semibold';

export default function StorageStatusPanel() {
  const [data, setData] = useState<StorageStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/admin/dashboard/storage-status`);
      const json = await res.json();
      setData(json.success ? json.data : null);
    } catch (error) {
      console.error('Erreur chargement comparaison des stockages:', error);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm font-medium">
          Stockage actif
          {data && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted">
              {data.activeProvider === 'cellar' ? 'Cellar' : 'GCS'}
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Rafraîchir
        </Button>
      </div>

      {!loading && !data && <p className="text-sm text-muted-foreground">Impossible de charger la comparaison.</p>}

      {data && (
        <>
          {!data.cellarConfigured && (
            <p className="text-sm text-muted-foreground">Cellar n&apos;est pas configuré sur cet environnement.</p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="py-2 pr-4 font-medium">Dossier</th>
                  <th className="py-2 pr-4 font-medium">GCS</th>
                  <th className="py-2 pr-4 font-medium">Cellar</th>
                  <th className="py-2 pr-4 font-medium">Absents de Cellar</th>
                  <th className="py-2 font-medium">Tailles différentes</th>
                </tr>
              </thead>
              <tbody>
                {data.folders.map((f) => (
                  <tr key={f.folder} className="border-b border-border last:border-0 align-top">
                    <td className="py-2 pr-4 font-mono text-xs">{f.folder}</td>
                    <td className="py-2 pr-4">{f.gcs.count} · {formatBytes(f.gcs.bytes)}</td>
                    <td className="py-2 pr-4">{f.cellar ? `${f.cellar.count} · ${formatBytes(f.cellar.bytes)}` : '—'}</td>
                    <td className="py-2 pr-4">
                      {f.missingOnCellar ? (
                        <span className={f.missingOnCellar.count > 0 ? ALERT : ''} title={f.missingOnCellar.sample.join('\n')}>
                          {f.missingOnCellar.count}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-2">
                      {f.sizeMismatch ? (
                        <span className={f.sizeMismatch.count > 0 ? ALERT : ''} title={f.sizeMismatch.sample.join('\n')}>
                          {f.sizeMismatch.count}
                        </span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-sm">
            Chemins enregistrés en URL complète en base :{' '}
            <span className={data.fullUrlValues.total > 0 ? ALERT : 'font-semibold'}>{data.fullUrlValues.total}</span>
            {data.fullUrlValues.total > 0 && (
              <span className="text-muted-foreground">
                {' '}({Object.entries(data.fullUrlValues.byColumn).filter(([, n]) => n > 0).map(([col, n]) => `${col} : ${n}`).join(', ')})
              </span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Aperçu par présence et taille. La vérification qui fait foi est <code>rclone check</code> (empreintes).
            Le compteur d&apos;URL complètes doit valoir 0 en prod avant la bascule.
          </p>
        </>
      )}
    </div>
  );
}
