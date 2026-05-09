'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { matchesAllTokens } from '@/utils/textSearch';
import { Search, User, FileText, X } from 'lucide-react';

interface PatientOption {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string;
}

type BilanType = 'INITIAL' | 'INTERMEDIAIRE' | 'FINAL';

interface NouveauBilanModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function NouveauBilanModal({ open, onOpenChange }: NouveauBilanModalProps) {
  const router = useRouter();
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [search, setSearch] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<PatientOption | null>(null);
  const [type, setType] = useState<BilanType>('INITIAL');
  const [loadingPatients, setLoadingPatients] = useState(false);

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedPatient(null);
      setType('INITIAL');
      return;
    }
    const fetchPatients = async () => {
      setLoadingPatients(true);
      try {
        const profileRes = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/kine/profile`);
        if (!profileRes.ok) return;
        const profile = await profileRes.json();
        const patientsRes = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/patients/kine/${profile.id}`);
        if (!patientsRes.ok) return;
        const data = await patientsRes.json();
        setPatients(Array.isArray(data) ? data : []);
      } catch {
        // silent
      } finally {
        setLoadingPatients(false);
      }
    };
    fetchPatients();
  }, [open]);

  const filteredPatients = patients
    .filter((p) => matchesAllTokens(`${p.firstName} ${p.lastName}`, search))
    .slice(0, 8);

  const goToCreation = (withPatientId: number | null) => {
    const params = new URLSearchParams();
    if (withPatientId !== null) params.set('patientId', String(withPatientId));
    params.set('type', type);
    router.push(`/dashboard/kine/bilan-kine/nouveau?${params.toString()}`);
    onOpenChange(false);
  };

  const handleContinueWithPatient = () => {
    if (!selectedPatient) return;
    goToCreation(selectedPatient.id);
  };

  const handleContinueLibre = () => {
    goToCreation(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[#3899aa]">
            <FileText className="w-5 h-5" />
            Nouveau bilan
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Patient */}
          <div>
            <Label className="text-sm mb-2 block">Patient</Label>
            {selectedPatient ? (
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#3899aa]/10 border border-[#3899aa]/30">
                <div className="flex items-center gap-2 min-w-0">
                  <User className="w-4 h-4 text-[#3899aa] shrink-0" />
                  <span className="text-sm font-medium truncate">
                    {selectedPatient.firstName} {selectedPatient.lastName.toUpperCase()}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(selectedPatient.birthDate).toLocaleDateString('fr-FR')}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedPatient(null)} className="h-7 px-2 shrink-0">
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher un patient..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>
                {search.trim() && (
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1 border border-border/50 rounded-lg p-1">
                    {loadingPatients ? (
                      <p className="text-sm text-muted-foreground text-center py-2">Chargement...</p>
                    ) : filteredPatients.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-2">Aucun patient trouvé</p>
                    ) : (
                      filteredPatients.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setSelectedPatient(p)}
                          className="w-full flex items-center gap-2 p-2 rounded hover:bg-[#3899aa]/10 text-left text-sm transition-colors"
                        >
                          <User className="w-4 h-4 text-[#3899aa] shrink-0" />
                          <span className="font-medium truncate">
                            {p.firstName} {p.lastName.toUpperCase()}
                          </span>
                          <span className="text-xs text-muted-foreground shrink-0 ml-auto">
                            {new Date(p.birthDate).toLocaleDateString('fr-FR')}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Type */}
          <div>
            <Label className="text-sm mb-2 block">Type de bilan</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['INITIAL', 'INTERMEDIAIRE', 'FINAL'] as BilanType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                    type === t
                      ? 'bg-[#3899aa] text-white'
                      : 'bg-muted text-foreground hover:bg-muted/80'
                  }`}
                >
                  {t === 'INITIAL' ? 'Initial' : t === 'INTERMEDIAIRE' ? 'Intermédiaire' : 'Final'}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2 pt-2">
            <Button
              onClick={handleContinueWithPatient}
              disabled={!selectedPatient}
              className="w-full btn-teal rounded-full h-10"
            >
              Continuer
            </Button>
            <Button
              variant="outline"
              onClick={handleContinueLibre}
              className="w-full rounded-full h-9 text-sm"
            >
              Continuer sans patient (mode libre)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
