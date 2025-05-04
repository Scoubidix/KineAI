import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

// ✅ Configuration Firebase avec les variables d'environnement
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID, // Optional
};

// ✅ Initialisation de Firebase (évite la double initialisation avec getApps)
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// ✅ Initialisation des services Firebase
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// ✅ Export des instances Firebase
export { app, auth, db, functions };

// Optional: Connexion aux émulateurs en développement
// if (process.env.NODE_ENV === 'development') {
//   try {
//     connectAuthEmulator(auth, "http://localhost:9099");
//     connectFirestoreEmulator(db, 'localhost', 8080);
//     connectFunctionsEmulator(functions, 'localhost', 5001);
//     console.log("Connected to Firebase Emulators");
//   } catch (error) {
//     console.error("Error connecting to Firebase Emulators:", error);
//   }
// }
