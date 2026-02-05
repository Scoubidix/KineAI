'use client';

import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { Plus, Trash2, Pencil, Loader2, UserCheck, Check, X, User, Mail, Phone, Calendar, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/components/AppLayout';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import Link from 'next/link';
import { fetchWithAuth } from '@/utils/fetchWithAuth';

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
  const [patients, setPatients] = useState<UserProfileData[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<UserProfileData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [patientToDelete, setPatientToDelete] = useState<UserProfileData | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [consentChecked, setConsentChecked] = useState(false);
  const [form, setForm] = useState<UserProfileData>({
    firstName: '',
    lastName: '',
    birthDate: '',
    phone: '',
    email: '',
    goals: '',
  });

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

  // Détection de la taille d'écran pour le mode d'affichage
  useEffect(() => {
    const handleResize = () => {
      setViewMode(window.innerWidth < 1024 ? 'cards' : 'table');
    };
    
    handleResize(); // Vérifier au montage
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAddOrUpdatePatient = async () => {
    const user = getAuth().currentUser;
    if (!user) return;

    const patientData = {
      ...form,
      kineId: user.uid,
    };

    try {
      const method = form.id ? 'PUT' : 'POST';
      const url = form.id ? `${apiUrl}/patients/${form.id}` : `${apiUrl}/patients`;
      const res = await fetchWithAuth(url, {
        method,
        body: JSON.stringify(patientData),
      });

      if (!res.ok) throw new Error("Erreur enregistrement patient");

      const updatedPatient = await res.json();
      let updatedList;
      if (form.id) {
        updatedList = patients.map(p => (p.id === form.id ? { ...updatedPatient, hasActiveProgram: p.hasActiveProgram } : p));
      } else {
        updatedList = [...patients, { ...updatedPatient, hasActiveProgram: false }];
      }
      
      const sortedList = sortPatients(updatedList);
      setPatients(sortedList);
      setFilteredPatients(sortedList);
      setForm({ firstName: '', lastName: '', birthDate: '', phone: '', email: '', goals: '' });
      setDialogOpen(false);
    } catch (err) {
      console.error('Erreur enregistrement patient SQL :', err);
    }
  };

  const handleEditPatient = (patient: UserProfileData) => {
    setForm(patient);
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
    const value = e.target.value.toLowerCase();
    setSearch(value);
    const filtered = patients.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(value) ||
      p.email.toLowerCase().includes(value) ||
      p.phone.includes(value)
    );
    setFilteredPatients(sortPatients(filtered));
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Liste des patients</h2>
            <Input 
              className="mt-2" 
              placeholder="Rechercher un patient (nom, email, téléphone)..." 
              value={search} 
              onChange={handleSearchChange} 
            />
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            // Réinitialiser le formulaire quand le modal se ferme
            if (!open) {
              setForm({ firstName: '', lastName: '', birthDate: '', phone: '', email: '', goals: '' });
              setConsentChecked(false);
            }
          }}>
            <DialogTrigger asChild>
              <Button className="flex items-center gap-2">
                <Plus className="h-4 w-4" /> {form.id ? 'Modifier' : 'Créer'} un patient
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[95vh] overflow-y-auto mx-4 sm:mx-auto">
              <DialogHeader className="bg-gradient-to-r from-blue-600 to-purple-600 -mx-6 -mt-6 px-6 py-4 rounded-t-lg">
                <DialogTitle className="text-lg sm:text-xl font-semibold text-white">
                  {form.id ? 'Modifier le patient' : 'Créer un nouveau patient'}
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
                        placeholder="Entrez le prénom"
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
                        placeholder="Entrez le nom de famille"
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
                        type="date" 
                        name="birthDate" 
                        value={form.birthDate} 
                        onChange={handleInputChange}
                        className="text-sm sm:text-base transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                        Téléphone *
                      </Label>
                      <Input 
                        id="phone"
                        name="phone" 
                        value={form.phone} 
                        onChange={handleInputChange}
                        placeholder="06 12 34 56 78"
                        className="text-sm sm:text-base transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        required
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                      Adresse email *
                    </Label>
                    <Input 
                      id="email"
                      type="email"
                      name="email" 
                      value={form.email} 
                      onChange={handleInputChange}
                      placeholder="exemple@email.com"
                      className="text-sm sm:text-base transition-all duration-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
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
                      placeholder="Décrivez les objectifs thérapeutiques, pathologies, zones à traiter..."
                      className="w-full px-3 py-2 text-sm sm:text-base border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition-all duration-200 resize-none"
                      rows={3}
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Ces informations aideront à personnaliser les programmes d'exercices
                    </p>
                  </div>
                </div>

                {/* Section validation */}
                <div className="flex flex-col gap-3 pt-4 sm:pt-6 border-t border-gray-200 dark:border-gray-700 sticky bottom-0 bg-white dark:bg-gray-900">
                  {/* Checkbox consentement RGPD */}
                  {!form.id && (
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

                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setDialogOpen(false);
                        // Le formulaire sera automatiquement réinitialisé par onOpenChange
                      }}
                      className="flex-1 sm:flex-none text-sm sm:text-base"
                    >
                      Annuler
                    </Button>
                    <Button
                      onClick={handleAddOrUpdatePatient}
                      className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg transition-all duration-200 text-sm sm:text-base"
                      disabled={!form.firstName || !form.lastName || !form.birthDate || !form.phone || !form.email || (!form.id && !consentChecked)}
                    >
                      {form.id ? 'Mettre à jour' : 'Créer le patient'}
                    </Button>
                  </div>

                  <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    * Champs obligatoires
                  </p>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="animate-spin w-6 h-6 text-gray-500" />
              </div>
            ) : error ? (
              <p className="text-red-500">{error}</p>
            ) : viewMode === 'cards' ? (
              // Vue en cartes pour mobile/tablette
              <div className="grid gap-4 md:grid-cols-2">
                {filteredPatients.map((p) => (
                  <div 
                    key={p.id} 
                    className={`border rounded-lg p-4 space-y-3 transition-all hover:shadow-md ${
                      p.hasActiveProgram 
                        ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20' 
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Link href={`/dashboard/kine/patients/${p.id}`}>
                          <Button size="sm" variant="ghost" className="hover:bg-blue-100 dark:hover:bg-blue-900/30">
                            <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                          </Button>
                        </Link>
                        <div>
                          <h3 className="font-semibold text-lg">
                            {p.firstName} {p.lastName.toUpperCase()}
                          </h3>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            Né(e) le {formatDate(p.birthDate)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {p.hasActiveProgram ? (
                          <div className="flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 rounded-full">
                            <Check className="w-4 h-4 text-green-600" />
                            <span className="text-xs text-green-700 dark:text-green-300">Programme actif</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-full">
                            <X className="w-4 h-4 text-gray-500" />
                            <span className="text-xs text-gray-600 dark:text-gray-400">Aucun programme</span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span className="text-gray-700 dark:text-gray-300">{p.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <span className="text-gray-700 dark:text-gray-300">{p.phone}</span>
                      </div>
                      {p.goals && (
                        <div className="flex items-start gap-2 mt-2">
                          <svg className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <span className="text-gray-600 dark:text-gray-400 text-xs leading-relaxed">
                            {p.goals}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                      <Button size="sm" variant="outline" onClick={() => handleEditPatient(p)}>
                        <Pencil className="w-4 h-4 mr-1" />
                        Modifier
                      </Button>
                      <Dialog open={deleteDialogOpen && patientToDelete?.id === p.id} onOpenChange={setDeleteDialogOpen}>
                        <DialogTrigger asChild>
                          <Button 
                            size="sm" 
                            variant="destructive" 
                            onClick={() => { setDeleteDialogOpen(true); setPatientToDelete(p); }}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            Supprimer
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Confirmer la suppression</DialogTitle>
                          </DialogHeader>
                          <p className="py-4">
                            Êtes-vous sûr de vouloir supprimer le patient{' '}
                            <strong>{p.firstName} {p.lastName.toUpperCase()}</strong> ?
                            Cette action est irréversible.
                          </p>
                          <div className="flex justify-end gap-4 mt-4">
                            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
                            <Button variant="destructive" onClick={handleDeletePatient}>Oui, supprimer</Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // Vue tableau pour desktop
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-500" />
                        Nom
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-gray-500" />
                        Prénom
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-500" />
                        Date de naissance
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-gray-500" />
                        Email
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-gray-500" />
                        Téléphone
                      </div>
                    </TableHead>
                    <TableHead className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Activity className="w-4 h-4 text-gray-500" />
                        Programme en cours
                      </div>
                    </TableHead>
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPatients.map((p) => (
                    <TableRow key={p.id} className={p.hasActiveProgram ? 'bg-green-50 dark:bg-green-900/20' : ''}>
                      <TableCell>
                        <Link href={`/dashboard/kine/patients/${p.id}`}>
                          <Button size="icon" variant="ghost" className="hover:bg-blue-100 dark:hover:bg-blue-900/30">
                            <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300" />
                          </Button>
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium">{p.lastName.toUpperCase()}</TableCell>
                      <TableCell>{p.firstName}</TableCell>
                      <TableCell>{formatDate(p.birthDate)}</TableCell>
                      <TableCell>{p.email}</TableCell>
                      <TableCell>{p.phone}</TableCell>
                      <TableCell className="text-center">
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
                      <TableCell className="flex gap-2">
                        <Button size="icon" variant="outline" onClick={() => handleEditPatient(p)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Dialog open={deleteDialogOpen && patientToDelete?.id === p.id} onOpenChange={setDeleteDialogOpen}>
                          <DialogTrigger asChild>
                            <Button 
                              size="icon" 
                              variant="destructive" 
                              onClick={() => { setDeleteDialogOpen(true); setPatientToDelete(p); }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Confirmer la suppression</DialogTitle>
                            </DialogHeader>
                            <p className="py-4">
                              Êtes-vous sûr de vouloir supprimer le patient{' '}
                              <strong>{p.firstName} {p.lastName.toUpperCase()}</strong> ?
                              Cette action est irréversible.
                            </p>
                            <div className="flex justify-end gap-4 mt-4">
                              <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
                              <Button variant="destructive" onClick={handleDeletePatient}>Oui, supprimer</Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}