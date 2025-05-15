'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import AppLayout from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Loader2, ArrowLeft, Sparkles, MessageSquare, BarChart2 } from 'lucide-react';
import Image from 'next/image';

interface PatientData {
  firstName: string;
  lastName: string;
  birthDate: string;
  email: string;
  phone: string;
  objectifs: string;
}

export default function PatientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const patientId = params?.patientId as string;
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPatient = async () => {
      try {
        const ref = doc(getFirestore(), 'users', patientId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setPatient(snap.data() as PatientData);
        }
      } catch (err) {
        console.error('Erreur de chargement du patient :', err);
      } finally {
        setLoading(false);
      }
    };
    if (patientId) fetchPatient();
  }, [patientId]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Button onClick={() => router.push('/dashboard/kine/patients')} variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" /> Retour à la liste des patients
          </Button>
        </div>

        <Card className="bg-gradient-to-r from-slate-800 to-slate-900 p-6 text-white">
          {loading ? (
            <div className="flex justify-center items-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : patient ? (
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full overflow-hidden border border-white">
                  <Image
                    src="/default-avatar.jpg"
                    alt="Avatar"
                    width={64}
                    height={64}
                    className="object-cover"
                  />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{patient.firstName} {patient.lastName}</h2>
                  <p className="text-sm text-slate-300">{patient.email}</p>
                  <p className="text-sm text-slate-300">📞 {patient.phone}</p>
                </div>
              </div>
              <div className="mt-4 md:mt-0 flex flex-col md:items-end gap-2">
                <Button className="bg-sky-500 hover:bg-sky-600">
                  <Sparkles className="w-4 h-4 mr-2" /> Créer Nouveau Programme
                </Button>
                <Button variant="secondary" disabled>
                  <MessageSquare className="w-4 h-4 mr-2" /> Envoyer Message (Bientôt)
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-red-500">Aucune donnée trouvée pour ce patient.</p>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Programme le Plus Récent</CardTitle>
            <CardDescription>Dernier programme assigné au patient</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground italic">À venir...</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>📊 Feedbacks Récents</CardTitle>
            <CardDescription>Derniers feedbacks soumis par {patient?.firstName} {patient?.lastName}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground italic">À venir...</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>📈 Statistiques Détaillées Patient (Bientôt)</CardTitle>
            <CardDescription>
              Visualisez les tendances des feedbacks et l’adhésion au programme.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground italic text-center py-4">Graphiques et statistiques détaillées apparaîtront ici.</p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
