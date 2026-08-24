'use client';

import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search } from 'lucide-react';
import { matchesAllTokens } from '@/utils/textSearch';

export interface PatientOption {
  id: number;
  firstName: string;
  lastName: string;
  email?: string | null;
  /** Un patient ne suit qu'un programme à la fois : les autres sont bloqués. */
  hasActiveProgramme?: boolean;
}

interface PatientPickerProps {
  patients: PatientOption[];
  selectedId: number | null;
  selectedName: string | null;
  onSelect: (patient: PatientOption) => void;
  onClear: () => void;
}

const getInitials = (firstName: string, lastName: string): string =>
  `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

/**
 * Recherche puis sélection d'un patient. Le projet n'a pas de primitive
 * combobox : on reprend le motif champ de recherche + liste, déjà utilisé par
 * l'ancien sélecteur, plutôt que d'ajouter une dépendance.
 */
export function PatientPicker({
  patients,
  selectedId,
  selectedName,
  onSelect,
  onClear,
}: PatientPickerProps) {
  const [query, setQuery] = useState('');

  // Le patient peut arriver par l'URL (« Nouveau programme » depuis sa fiche) :
  // on n'a alors que son identifiant. Dès que la liste est chargée, on complète
  // le brouillon avec son nom, sinon le récapitulatif resterait à « — ».
  useEffect(() => {
    if (!selectedId || selectedName) return;
    const found = patients.find((p) => p.id === selectedId);
    if (found) onSelect(found);
  }, [selectedId, selectedName, patients, onSelect]);

  if (selectedId) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2">
        <span className="flex-1 min-w-0 truncate text-sm font-medium">{selectedName}</span>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Changer
        </Button>
      </div>
    );
  }

  // La liste ne s'ouvre qu'à la saisie : afficher d'emblée tous les patients
  // remplirait l'écran d'une donnée que le kiné n'a pas demandée.
  const hasQuery = query.trim().length > 0;

  const filtered = hasQuery
    ? patients.filter((patient) =>
        matchesAllTokens(
          `${patient.lastName} ${patient.firstName} ${patient.email ?? ''}`,
          query,
        ),
      )
    : [];

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-10"
          placeholder="Rechercher un patient…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {hasQuery && (
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Aucun patient trouvé</p>
          ) : (
          filtered.map((patient) => {
            const blocked = !!patient.hasActiveProgramme;

            return (
              <Card
                key={patient.id}
                className={`p-3 transition-all duration-300 ${
                  blocked
                    ? 'cursor-not-allowed bg-gray-100 opacity-60 dark:bg-gray-800'
                    : 'cursor-pointer hover:border-[#3899aa]/50 hover:bg-[#3899aa]/10 hover:shadow-[0_0_12px_rgba(56,153,170,0.3)]'
                }`}
                onClick={() => !blocked && onSelect(patient)}
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-medium text-secondary-foreground">
                    {getInitials(patient.firstName, patient.lastName)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={`text-sm font-medium ${
                          blocked ? 'text-gray-500 dark:text-gray-400' : ''
                        }`}
                      >
                        {patient.lastName.toUpperCase()} {patient.firstName}
                      </p>
                      {blocked && (
                        <Badge
                          variant="secondary"
                          className="bg-orange-100 text-xs text-orange-700 dark:bg-orange-900/50 dark:text-orange-300"
                        >
                          Programme en cours
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })
          )}
        </div>
      )}
    </div>
  );
}
