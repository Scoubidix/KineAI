'use client';

import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  getFirestore,
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  Timestamp
} from 'firebase/firestore';
import { Plus, Trash2, Pencil, Loader2, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import AppLayout from '@/components/AppLayout';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import Link from 'next/link';

interface UserProfileData {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  phone: string;
  email: string;
  objectifs: string;
  createdAt?: Timestamp;
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<UserProfileData[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<UserProfileData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    birthDate: '',
    phone: '',
    email: '',
    objectifs: '',
    id: ''
  });

  const fetchPatients = async (uid: string) => {
    setLoading(true);
    try {
      const q = query(
        collection(getFirestore(), 'users'),
        where('role', '==', 'patient'),
        where('linkedKine', '==', uid)
      );
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as UserProfileData[];
      setPatients(data);
      setFilteredPatients(data);
    } catch (err) {
      setError('Erreur de chargement des patients.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        fetchPatients(user.uid);
      } else {
        setError("Utilisateur non authentifié");
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase();
    setSearch(value);
    setFilteredPatients(patients.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(value)
    ));
  };

  const handleAddOrUpdatePatient = async () => {
    const user = getAuth().currentUser;
    if (!user) return;

    const patientData = {
      firstName: form.firstName,
      lastName: form.lastName,
      birthDate: form.birthDate,
      phone: form.phone,
      email: form.email,
      objectifs: form.objectifs,
      role: 'patient',
      linkedKine: user.uid,
      createdAt: Timestamp.now()
    };

    try {
      if (form.id) {
        await updateDoc(doc(getFirestore(), 'users', form.id), patientData);
        fetchPatients(user.uid);
      } else {
        const docRef = await addDoc(collection(getFirestore(), 'users'), patientData);
        const newPatient = { id: docRef.id, ...patientData };
        setPatients(prev => [...prev, newPatient]);
        setFilteredPatients(prev => [...prev, newPatient]);
      }
      setForm({ firstName: '', lastName: '', birthDate: '', phone: '', email: '', objectifs: '', id: '' });
      setDialogOpen(false);
    } catch (error) {
      console.error("Erreur ajout ou modification patient :", error);
    }
  };

  const handleEdit = (patient: UserProfileData) => {
    setForm(patient);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const user = getAuth().currentUser;
    if (!user) return;
    try {
      await deleteDoc(doc(getFirestore(), 'users', id));
      fetchPatients(user.uid);
    } catch (error) {
      console.error("Erreur suppression patient :", error);
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Liste des patients</h2>
            <Input className="mt-2" placeholder="Rechercher un patient..." value={search} onChange={handleSearchChange} />
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4 mr-2" /> Créer un patient
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{form.id ? "Modifier le patient" : "Créer un nouveau patient"}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <Label>Prénom</Label>
                  <Input name="firstName" value={form.firstName} onChange={handleInputChange} />
                </div>
                <div>
                  <Label>Nom</Label>
                  <Input name="lastName" value={form.lastName} onChange={handleInputChange} />
                </div>
                <div>
                  <Label>Date de naissance</Label>
                  <Input type="date" name="birthDate" value={form.birthDate} onChange={handleInputChange} />
                </div>
                <div>
                  <Label>Téléphone</Label>
                  <Input name="phone" value={form.phone} onChange={handleInputChange} />
                </div>
                <div className="md:col-span-2">
                  <Label>Email</Label>
                  <Input name="email" value={form.email} onChange={handleInputChange} />
                </div>
                <div className="md:col-span-2">
                  <Label>Objectifs de la rééducation</Label>
                  <Input name="objectifs" value={form.objectifs} onChange={handleInputChange} />
                </div>
                <Button className="md:col-span-2" onClick={handleAddOrUpdatePatient}>
                  Valider
                </Button>
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
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead></TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Prénom</TableHead>
                    <TableHead>Date de naissance</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Téléphone</TableHead>
                    <TableHead>Objectifs</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPatients.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Link href={`/dashboard/kine/patients/${p.id}`}>
                          <FolderOpen className="w-4 h-4 text-muted-foreground hover:text-primary" />
                        </Link>
                      </TableCell>
                      <TableCell>{p.lastName}</TableCell>
                      <TableCell>{p.firstName}</TableCell>
                      <TableCell>{p.birthDate}</TableCell>
                      <TableCell>{p.email}</TableCell>
                      <TableCell>{p.phone}</TableCell>
                      <TableCell>{p.objectifs}</TableCell>
                      <TableCell className="flex gap-2">
                        <Button size="icon" variant="outline" onClick={() => handleEdit(p)}><Pencil className="w-4 h-4" /></Button>
                        <Button size="icon" variant="destructive" onClick={() => handleDelete(p.id)}><Trash2 className="w-4 h-4" /></Button>
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
