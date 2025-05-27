'use client';

import { useEffect, useState } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { Plus, Trash2, Pencil, Loader2, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AppLayout from '@/components/AppLayout';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import Link from 'next/link';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

interface UserProfileData {
  id?: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  phone: string;
  email: string;
  goals: string;
}

export default function PatientsPage() {
  const [patients, setPatients] = useState<UserProfileData[]>([]);
  const [filteredPatients, setFilteredPatients] = useState<UserProfileData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<UserProfileData>({
    firstName: '',
    lastName: '',
    birthDate: '',
    phone: '',
    email: '',
    goals: '',
  });

  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          setLoading(true);
          const res = await fetch(`${apiUrl}/patients/${user.uid}`);
          if (!res.ok) throw new Error("Erreur récupération patients");
          const data = await res.json();
          setPatients(data);
          setFilteredPatients(data);
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
      const res = await fetch(`${apiUrl}/patients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patientData),
      });

      if (!res.ok) throw new Error("Erreur création patient");

      const newPatient = await res.json();
      const updatedPatients = [...patients, newPatient];
      setPatients(updatedPatients);
      setFilteredPatients(updatedPatients);
      setForm({ firstName: '', lastName: '', birthDate: '', phone: '', email: '', goals: '' });
      setDialogOpen(false);
    } catch (err) {
      console.error('Erreur création patient SQL :', err);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase();
    setSearch(value);
    setFilteredPatients(patients.filter(p =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(value)
    ));
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Liste des patients</h2>
            <Input className="mt-2" placeholder="Rechercher un patient." value={search} onChange={handleSearchChange} />
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4 mr-2" /> Créer un patient
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Créer un nouveau patient</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div><Label>Prénom</Label><Input name="firstName" value={form.firstName} onChange={handleInputChange} /></div>
                <div><Label>Nom</Label><Input name="lastName" value={form.lastName} onChange={handleInputChange} /></div>
                <div><Label>Date de naissance</Label><Input type="date" name="birthDate" value={form.birthDate} onChange={handleInputChange} /></div>
                <div><Label>Téléphone</Label><Input name="phone" value={form.phone} onChange={handleInputChange} /></div>
                <div className="md:col-span-2"><Label>Email</Label><Input name="email" value={form.email} onChange={handleInputChange} /></div>
                <div className="md:col-span-2"><Label>Objectifs</Label><Input name="goals" value={form.goals} onChange={handleInputChange} /></div>
                <Button className="md:col-span-2" onClick={handleAddOrUpdatePatient}>Valider</Button>
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
                      <TableCell>{p.goals}</TableCell>
                      <TableCell className="flex gap-2">
                        <Button size="icon" variant="outline"><Pencil className="w-4 h-4" /></Button>
                        <Button size="icon" variant="destructive"><Trash2 className="w-4 h-4" /></Button>
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
