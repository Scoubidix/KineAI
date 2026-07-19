'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listSeances, cancelSeance, VisioSeance, VisioStatus } from '@/lib/visioApi';
import { Button } from '@/components/ui/button';
import { Plus, Video, X } from 'lucide-react';
import NouveauVisioModal from './components/NouveauVisioModal';

const STATUS_LABELS: Record<VisioStatus, string> = {
  SCHEDULED: 'Programmée',
  LIVE: 'En cours',
  ENDED: 'Terminée',
  CANCELLED: 'Annulée',
};

const STATUS_CLASSES: Record<VisioStatus, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  LIVE: 'bg-green-100 text-green-700',
  ENDED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-600',
};

export default function VisioPage() {
  const router = useRouter();
  const [seances, setSeances] = useState<VisioSeance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const fetchSeances = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    listSeances()
      .then(setSeances)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchSeances();
    // Rafraîchissement silencieux pour refléter la présence du patient en (quasi) temps réel
    const t = setInterval(() => fetchSeances(true), 10000);
    return () => clearInterval(t);
  }, [fetchSeances]);

  const handleCancel = async (id: number) => {
    if (!confirm('Annuler cette séance ? Le lien du patient sera invalidé.')) return;
    setCancellingId(id);
    try {
      await cancelSeance(id);
      fetchSeances();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Vidéotransmission</h1>
        <Button onClick={() => setModalOpen(true)} className="btn-teal gap-2">
          <Plus className="h-4 w-4" />
          Nouveau RDV
        </Button>
      </div>

      {loading && <p className="text-muted-foreground">Chargement…</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && (
        <ul className="space-y-2">
          {seances.map((s) => {
            const joinable = s.status === 'SCHEDULED' || s.status === 'LIVE';
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded border p-3"
              >
                <div className="flex flex-col">
                  <span className="font-medium">
                    {s.patient?.firstName} {s.patient?.lastName}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {new Date(s.scheduledAt).toLocaleString('fr-FR')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASSES[s.status]}`}
                  >
                    {STATUS_LABELS[s.status]}
                  </span>
                  {joinable && s.patientPresent && (
                    <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                      Patient en salle
                    </span>
                  )}
                  {joinable && (
                    <Button
                      size="sm"
                      className="btn-teal gap-1.5"
                      onClick={() => router.push(`/dashboard/kine/visio/${s.id}/room`)}
                    >
                      <Video className="h-4 w-4" />
                      Rejoindre
                    </Button>
                  )}
                  {s.status === 'SCHEDULED' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={cancellingId === s.id}
                      onClick={() => handleCancel(s.id)}
                    >
                      <X className="h-4 w-4" />
                      {cancellingId === s.id ? 'Annulation…' : 'Annuler'}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
          {seances.length === 0 && (
            <li className="text-muted-foreground">Aucune séance programmée.</li>
          )}
        </ul>
      )}

      <NouveauVisioModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={fetchSeances}
      />
    </div>
  );
}
