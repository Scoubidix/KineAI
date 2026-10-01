'use client';

import { useEffect, useState } from 'react';
import { getAuth } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fetchWithAuth } from '@/utils/fetchWithAuth';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

/** Patient tel que le renvoie l'API (`/patients`) */
export interface PatientFormData {
  id?: string | number;
  firstName: string;
  lastName: string;
  birthDate: string;
  phone: string;
  email: string;
  goals: string;
}

const EMPTY: PatientFormData = { firstName: '', lastName: '', birthDate: '', phone: '', email: '', goals: '' };

// Saisie de la date de naissance en texte JJ/MM/AAAA (pas de calendrier natif).
// Insertion automatique des « / » au fil de la frappe.
const formatBirthDateInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 8); // JJMMAAAA
  if (digits.length >= 5) return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return digits;
};

// JJ/MM/AAAA → AAAA-MM-JJ (ISO). Renvoie '' si la date n'est pas une date calendaire valide.
const frToIso = (value: string): string => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!m) return '';
  const [, dd, mm, yyyy] = m;
  const d = Number(dd), mo = Number(mm), y = Number(yyyy);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return '';
  return `${yyyy}-${mm}-${dd}`;
};

// ISO / date backend → JJ/MM/AAAA pour pré-remplir le champ en édition.
const isoToFr = (value: string): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
};

interface PatientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Patient à modifier (avec `id`), ou valeurs de départ d'une création (ex. nom tapé dans une recherche) */
  initial?: Partial<PatientFormData> | null;
  /** Patient enregistré, tel que renvoyé par l'API */
  onSaved: (patient: PatientFormData & { id: string | number }) => void;
}

/**
 * Création / modification d'un patient : la même modale partout (page Patients, sélecteur de
 * patient du bilan), donc les mêmes champs, le même format de date et le même consentement RGPD
 * obligatoire à la création.
 */
export default function PatientFormDialog({ open, onOpenChange, initial, onSaved }: PatientFormDialogProps) {
  const [form, setForm] = useState<PatientFormData>(EMPTY);
  const [consentChecked, setConsentChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const isEdit = initial?.id !== undefined && initial?.id !== null;

  // Formulaire remis à neuf à chaque ouverture, à partir des valeurs fournies
  useEffect(() => {
    if (!open) return;
    setForm({
      ...EMPTY,
      ...initial,
      email: initial?.email ?? '', // email peut être null en base : '' pour l'input contrôlé
      phone: initial?.phone ?? '',
      goals: initial?.goals ?? '',
      birthDate: initial?.birthDate && isEdit ? isoToFr(initial.birthDate) : initial?.birthDate ?? '',
    });
    setConsentChecked(false);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    const user = getAuth().currentUser;
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetchWithAuth(isEdit ? `${apiUrl}/patients/${form.id}` : `${apiUrl}/patients`, {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify({ ...form, birthDate: frToIso(form.birthDate), kineId: user.uid }),
      });
      if (!res.ok) throw new Error('Erreur enregistrement patient');
      onSaved(await res.json());
      onOpenChange(false);
    } catch (err) {
      console.error('Erreur enregistrement patient SQL :', err);
      setError('Enregistrement impossible, réessaie dans un instant.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[95vh] overflow-y-auto top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="bg-gradient-to-r from-[#4db3c5] to-[#1f5c6a] -mx-6 -mt-6 px-6 py-4 rounded-t-lg">
          <DialogTitle className="text-lg sm:text-xl font-semibold text-white">
            {isEdit ? 'Modifier le patient' : 'Créer un nouveau patient'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 sm:space-y-6 py-4">
          {/* Section Informations personnelles */}
          <div className="space-y-3 sm:space-y-4">
            <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <div className="w-1 h-5 sm:h-6 bg-blue-500 rounded-full"></div>
              Informations personnelles
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                  Prénom *
                </Label>
                <Input
                  id="firstName"
                  name="firstName"
                  value={form.firstName}
                  onChange={handleInputChange}
                  placeholder="Nicolas"
                  className="text-sm sm:text-base transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                  Nom de famille *
                </Label>
                <Input
                  id="lastName"
                  name="lastName"
                  value={form.lastName}
                  onChange={handleInputChange}
                  placeholder="Dupont"
                  className="text-sm sm:text-base transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="birthDate" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                  Date de naissance *
                </Label>
                <Input
                  id="birthDate"
                  type="text"
                  inputMode="numeric"
                  name="birthDate"
                  value={form.birthDate}
                  onChange={(e) => setForm({ ...form, birthDate: formatBirthDateInput(e.target.value) })}
                  placeholder="JJ/MM/AAAA"
                  maxLength={10}
                  className="text-sm sm:text-base transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                  Téléphone
                </Label>
                <Input
                  id="phone"
                  name="phone"
                  value={form.phone}
                  onChange={handleInputChange}
                  placeholder="06 12 34 56 78"
                  className="text-sm sm:text-base transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                Adresse email
              </Label>
              <Input
                id="email"
                type="email"
                name="email"
                value={form.email}
                onChange={handleInputChange}
                placeholder="exemple@email.com"
                className="text-sm sm:text-base transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Section Informations médicales */}
          <div className="space-y-3 sm:space-y-4">
            <h3 className="text-base sm:text-lg font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <div className="w-1 h-5 sm:h-6 bg-green-500 rounded-full"></div>
              Informations médicales
            </h3>

            <div className="space-y-2">
              <Label htmlFor="goals" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                Objectifs de traitement
              </Label>
              <textarea
                id="goals"
                name="goals"
                value={form.goals}
                onChange={(e) => setForm({ ...form, goals: e.target.value })}
                placeholder="Décris les objectifs thérapeutiques, pathologies, zones à traiter..."
                className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-all duration-200 resize-none"
                rows={3}
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Ces informations aideront à personnaliser les programmes d'exercices
              </p>
            </div>
          </div>

          {/* Section validation */}
          <div className="flex flex-col gap-3 pt-4 sm:pt-6 border-t border-gray-200 dark:border-gray-700">
            {/* Checkbox consentement RGPD */}
            {!isEdit && (
              <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <input
                  type="checkbox"
                  id="consent-checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                />
                <label htmlFor="consent-checkbox" className="flex-1 text-xs sm:text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  J'ai remis au patient le{' '}
                  <a
                    href="/legal/consentement-patient.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Formulaire de consentement patient
                  </a>
                  {' '}(signature obligatoire)
                </label>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                className="flex-1 sm:flex-none text-sm sm:text-base"
              >
                Annuler
              </Button>
              <Button
                onClick={handleSubmit}
                className="btn-teal flex-1 text-sm sm:text-base"
                disabled={saving || !form.firstName || !form.lastName || !frToIso(form.birthDate) || (!isEdit && !consentChecked)}
              >
                {isEdit ? 'Mettre à jour' : 'Créer le patient'}
              </Button>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              * Champs obligatoires
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
