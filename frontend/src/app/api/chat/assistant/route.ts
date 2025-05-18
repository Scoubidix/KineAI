import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import OpenAI from 'openai';
import { readFileSync } from 'fs';
import path from 'path';

// 🔐 Chargement du fichier de clé privée Firebase depuis le disque
const serviceAccountPath = path.resolve(process.cwd(), 'firebase-admin-sdk.json');
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const db = getFirestore();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const { message } = await req.json();

    if (!token || !message) {
      return NextResponse.json({ error: 'Token ou message manquant.' }, { status: 400 });
    }

    const decoded = await getAuth().verifyIdToken(token);
    const kineId = decoded.uid;

    const snapshot = await db
      .collection('users')
      .where('role', '==', 'patient')
      .where('linkedKine', '==', kineId)
      .get();

    const patients = snapshot.docs.map((doc: QueryDocumentSnapshot) => {
      const data = doc.data();
      return {
        id: doc.id,
        fullName: `${data.firstName} ${data.lastName}`,
        email: data.email,
        objectifs: data.objectifs || '',
        phone: data.phone || '',
        birthDate: data.birthDate || '',
        createdAt: data.createdAt || '',
      };
    });

    const patientsFormatted = patients.map(p => 
      `• Nom : ${p.fullName}\n  Email : ${p.email}\n  Objectifs : ${p.objectifs || 'Non précisé'}\n  Date de naissance : ${p.birthDate || 'Non précisée'}\n  Téléphone : ${p.phone || 'Non précisé'}`
    ).join('\n\n');

    const systemPrompt = `
Tu es un assistant IA pour un kinésithérapeute. Voici la liste de ses patients.

Ta tâche : si l'utilisateur mentionne un patient, même avec une orthographe partielle ou approximative, tu dois retrouver ce patient dans la liste ci-dessous, faire une correspondance intelligente, et donner les infos correspondantes.

Ne dis jamais "patient non trouvé" sans avoir vérifié toute la liste. Fais de ton mieux pour interpréter les noms.

Liste des patients :
${patientsFormatted}
`;

    console.log('📋 Prompt envoyé à GPT :');
    console.log(systemPrompt);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ],
      temperature: 0.7
    });

    const reply = response.choices[0].message.content;
    return NextResponse.json({ reply });
  } catch (err) {
    console.error('[GPT Assistant ERROR]', err);
    return NextResponse.json({ error: 'Erreur serveur assistant GPT' }, { status: 500 });
  }
}
