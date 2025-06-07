'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import Image from 'next/image';
import { fetchWithAuth } from '@/utils/fetchWithAuth';

interface PatientData {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string;
  email: string;
  phone: string;
}

function calculateAge(birthDateStr: string) {
  const birthDate = new Date(birthDateStr);
  const ageDiff = Date.now() - birthDate.getTime();
  return Math.floor(ageDiff / (1000 * 60 * 60 * 24 * 365.25));
}

export default function PatientDetailPage() {
  const { patientId } = useParams();
  const [patient, setPatient] = useState<PatientData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPatient = async () => {
      try {
        const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/patients/${patientId}`);
        if (!res.ok) throw new Error('Erreur récupération patient');
        const data = await res.json();
        setPatient(data.patient);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (patientId) {
      fetchPatient();
    }
  }, [patientId]);

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Bloc 1 : infos patient */}
        <Card className="bg-slate-800 text-white p-4">
          {loading ? <Loader2 className="animate-spin mx-auto" /> : patient && (
            <div className="flex items-start gap-4">
              <Image src="/default-avatar.jpg" alt="Avatar" width={64} height={64} className="rounded-full border" />
              <div>
                <h2 className="text-xl font-bold">{patient.lastName.toUpperCase()} {patient.firstName}</h2>
                <p>Date de naissance : {patient.birthDate}</p>
                <p>Âge : {calculateAge(patient.birthDate)} ans</p>
                <p>Email : {patient.email}</p>
                <p>Téléphone : {patient.phone}</p>
              </div>
            </div>
          )}
        </Card>

        {/* Bloc 2, 3, 4 à venir */}
      </div>
    </AppLayout>
  );
}
