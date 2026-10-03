'use client';

// Carte admin temporaire : go/no-go du ménage GCS. Avant la route de redirection
// (/api/media/demo), les démos du chat patient étaient des URLs GCS v2 écrites en
// dur dans les messages. Tant qu'un chat encore accessible en contient, le bucket
// GCS et `storage.googleapis.com` doivent rester en place.
// ⚠️ À supprimer, avec la route et le service backend, une fois le ménage fait.
import React, { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { Loader2, HardDrive } from 'lucide-react';

interface LegacyDemoLinksStatus {
  count: number;
  lastDateFin: string | null;
  ready: boolean;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

export default function LegacyDemoLinksCard() {
  const [data, setData] = useState<LegacyDemoLinksStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/admin/dashboard/legacy-demo-links`);
        const json = await res.json();
        if (json.success) setData(json.data);
      } catch (error) {
        console.error('Erreur chargement suivi des anciens liens GCS:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <HardDrive className="h-4 w-4 text-muted-foreground" /> Ménage GCS : anciens liens de démo
        </div>
        {data && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
              data.ready
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
            }`}
          >
            {data.ready ? 'GO' : 'NO-GO'}
          </span>
        )}
      </div>

      {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mt-3" />}

      {!loading && !data && (
        <p className="text-sm text-muted-foreground mt-2">Impossible de charger le suivi.</p>
      )}

      {data && (
        <div className="mt-2 space-y-1">
          {data.ready ? (
            <p className="text-sm">Plus aucun chat accessible ne contient d&apos;ancien lien GCS.</p>
          ) : (
            <>
              <p className="text-sm">
                <span className="font-semibold">{data.count}</span> programme{data.count > 1 ? 's' : ''} en cours
                avec d&apos;anciens liens GCS
              </p>
              {data.lastDateFin && (
                <p className="text-sm text-muted-foreground">
                  Le dernier se termine le {formatDate(data.lastDateFin)}
                </p>
              )}
            </>
          )}
          <p className="text-xs text-muted-foreground pt-1">
            Au GO : retirer storage.googleapis.com (CSP, sw.ts, DEMO_LINK d&apos;openaiService), vérifier avec
            rclone check, garder le bucket quelques semaines, puis le supprimer.
          </p>
        </div>
      )}
    </div>
  );
}
