'use client';

import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { Plus, Trash2, Pencil, Loader2, Check, X, User, Mail, Phone, Calendar, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PatientFormDialog from '@/components/patients/PatientFormDialog';
import { useRouter, useSearchParams } from 'next/navigation';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { matchesAllTokens } from '@/utils/textSearch';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

interface UserProfileData {
  id?: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  phone: string;
  email: string;
  goals: string;
  hasActiveProgram?: boolean; // Nouveau champ pour indiquer si le patient a un programme actif
}

export default function PatientsPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<UserProfileData[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<UserProfileData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<UserProfileData | null>(null);
  // Patient en cours de modification (null : création)
  const [editing, setEditing] = useState<UserProfileData | null>(null);

  // Ouverture auto de la modal de création si redirigé depuis l'accueil (?new=1)
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setEditing(null);
      setDialogOpen(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete('new');
      router.replace(`/dashboard/kine/patients${params.toString() ? `?${params.toString()}` : ''}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Fonction pour formater la date au format JJ/MM/AAAA
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Fonction pour trier les patients : ceux avec programme en cours d'abord, puis ordre alphabétique
  const sortPatients = (patientsList: UserProfileData[]) => {
    return patientsList.sort((a, b) => {
      // Priorité aux patients avec programme actif
      if (a.hasActiveProgram && !b.hasActiveProgram) return -1;
      if (!a.hasActiveProgram && b.hasActiveProgram) return 1;
      
      // Ensuite tri alphabétique par nom de famille puis prénom
      const lastNameComparison = a.lastName.localeCompare(b.lastName);
      if (lastNameComparison !== 0) return lastNameComparison;
      return a.firstName.localeCompare(b.firstName);
    });
  };

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          setLoading(true);
          // Récupérer les patients
          const res = await fetchWithAuth(`${apiUrl}/patients/kine/${user.uid}`);
          if (!res.ok) throw new Error("Erreur récupération patients");
          const patientsData = await res.json();
          
          // Pour chaque patient, vérifier s'il a un programme actif
          const patientsWithProgramStatus = await Promise.all(
            patientsData.map(async (patient: UserProfileData) => {
              try {
                const programRes = await fetchWithAuth(`${apiUrl}/programmes/${patient.id}`);
                if (programRes.ok) {
                  const programs = await programRes.json();
                  return {
                    ...patient,
                    hasActiveProgram: programs && programs.length > 0
                  };
                }
                return { ...patient, hasActiveProgram: false };
              } catch (err) {
                console.error(`Erreur vérification programme pour patient ${patient.id}:`, err);
                return { ...patient, hasActiveProgram: false };
              }
            })
          );

          const sortedPatients = sortPatients(patientsWithProgramStatus);
          setPatients(sortedPatients);
          setFilteredPatients(sortedPatients);
        } catch (err) {
          console.error(err);
          setError("Erreur lors de la récupération des patients.");
        } finally {
          setLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Patient enregistré par la modale : mis à jour en place, ou ajouté (sans programme actif)
  const handlePatientSaved = (saved: UserProfileData) => {
    const updatedList = editing
      ? patients.map(p => (p.id === editing.id ? { ...saved, hasActiveProgram: p.hasActiveProgram } : p))
      : [...patients, { ...saved, hasActiveProgram: false }];
    const sortedList = sortPatients(updatedList);
    setPatients(sortedList);
    setFilteredPatients(sortedList);
  };

  const handleEditPatient = (patient: UserProfileData) => {
    setEditing(patient);
    setDialogOpen(true);
  };

  const handleDeletePatient = async () => {
    if (!patientToDelete) return;
    try {
      const res = await fetchWithAuth(`${apiUrl}/patients/${patientToDelete.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erreur suppression patient');
      const updated = patients.filter(p => p.id !== patientToDelete.id);
      setPatients(updated);
      setFilteredPatients(updated);
      setDeleteDialogOpen(false);
      setPatientToDelete(null);
    } catch (err) {
      console.error('Erreur suppression patient :', err);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    const filtered = patients.filter(p =>
      matchesAllTokens(`${p.firstName} ${p.lastName} ${p.email ?? ''} ${p.phone}`, value)
    );
    setFilteredPatients(sortPatients(filtered));
  };

  return (
    <>
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <div className="space-y-2">
            <h2 className="text-xl sm:text-2xl font-bold text-[#3899aa]">Liste des patients</h2>
            <Input
              className="w-full sm:w-80"
              placeholder="Rechercher (nom, mail, tél...)"
              value={search}
              onChange={handleSearchChange}
            />
          </div>
          <Button className="btn-teal flex items-center gap-2 w-full sm:w-auto" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" /> Créer un patient
          </Button>
          <PatientFormDialog
            open={dialogOpen}
            onOpenChange={setDialogOpen}
            initial={editing}
            onSaved={(saved) => handlePatientSaved(saved as UserProfileData)}
          />
        </div>

        <Card className="card-hover">
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="animate-spin w-6 h-6 text-gray-500" />
              </div>
            ) : error ? (
              <p className="text-red-500">{error}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-500" />
                          <span className="lg:hidden">Patient</span>
                          <span className="hidden lg:inline">Nom</span>
                        </div>
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-gray-500" />
                          Prénom
                        </div>
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-500" />
                          Date de naissance
                        </div>
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <Mail className="w-4 h-4 text-gray-500" />
                          Email
                        </div>
                      </TableHead>
                      <TableHead className="hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-500" />
                          Téléphone
                        </div>
                      </TableHead>
                      <TableHead className="hidden sm:table-cell text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Activity className="w-4 h-4 text-gray-500" />
                          Programme
                        </div>
                      </TableHead>
                      <TableHead className="w-auto lg:w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPatients.map((p) => (
                      <TableRow key={p.id} onClick={() => router.push(`/dashboard/kine/patients/${p.id}`)} className={`cursor-pointer transition-all duration-300 hover:border hover:border-[#3899aa]/50 hover:shadow-[0_0_12px_rgba(56,153,170,0.3)] hover:bg-[#3899aa]/10 ${p.hasActiveProgram ? 'bg-green-50 dark:bg-green-900/20' : ''}`}>
                        <TableCell>
                          <div>
                            <span className="font-medium">
                              <span className="lg:hidden">{p.firstName} </span>
                              {p.lastName.toUpperCase()}
                            </span>
                            <div className="lg:hidden text-xs text-gray-500 dark:text-gray-400 mt-1">
                              {p.email ? `${p.email} · ` : ''}{p.phone}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">{p.firstName}</TableCell>
                        <TableCell className="hidden lg:table-cell">{formatDate(p.birthDate)}</TableCell>
                        <TableCell className="hidden lg:table-cell">{p.email}</TableCell>
                        <TableCell className="hidden lg:table-cell">{p.phone}</TableCell>
                        <TableCell className="hidden sm:table-cell text-center">
                          <div className="flex items-center justify-center">
                            {p.hasActiveProgram ? (
                              <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800">
                                <Check className="w-3 h-3 mr-1" />
                                Actif
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="bg-gray-100 text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400">
                                Aucun
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button size="icon" variant="outline" onClick={(e) => { e.stopPropagation(); handleEditPatient(p); }}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="destructive"
                              onClick={(e) => { e.stopPropagation(); setPatientToDelete(p); setDeleteDialogOpen(true); }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dialog de suppression unique */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-md top-4 translate-y-0 sm:top-[50%] sm:translate-y-[-50%]" onOpenAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Confirmer la suppression</DialogTitle>
            </DialogHeader>
            <p className="py-4 text-sm sm:text-base">
              Es-tu sûr de vouloir supprimer le patient{' '}
              <strong>{patientToDelete?.firstName} {patientToDelete?.lastName?.toUpperCase()}</strong> ?
              Cette action est irréversible.
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-4 mt-4">
              <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
              <Button variant="destructive" onClick={handleDeletePatient}>Oui, supprimer</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}