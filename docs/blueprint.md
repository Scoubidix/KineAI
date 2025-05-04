# **App Name**: KineAI

## Core Features:

- Exercise Program Display: Patient dashboard to view exercise program, including title, description, frequency, repetitions, and a mini-illustration for each exercise.
- AI Chatbot: AI-powered chatbot to help patients understand exercises and providing motivation and answers to basic health questions. The LLM uses a tool to decide whether it can answer the health question, or if it needs to refer the patient to their PT.
- Feedback Collection: Post-session feedback form for patients to input pain level (0-10), fatigue level (0-10), and a free text comment.
- Kiné dashboard: View list of patients, assign new exercise programs manually or by triggering an AI function, view feedbacks submitted by each patient, simple dashboard navigation (sidebar), and future support for program sales (placeholder).
- Role-based access: Role `"patient"` for patients, role `"kine"` for physiotherapists, and render each dashboard according to the role.
- generateProgram() Cloud Function: Calls OpenAI API, inputs: patient goal, level, available equipment, duration, output: personalized exercise plan (as JSON), and save result in Firestore under `programmes`.
- Cloud Firestore structure: `users` → id, role, email, name, related patients or kine, `programmes` → id_kine, id_patient, AI-generated content, objective, `feedbacks` → id_programme, date, pain, fatigue, comment, and `exercises` → base library used by the AI.
- Future-proofing: Placeholder for Stripe payment integration, placeholder for patient affiliation and referral logic, placeholder for analytics module (charting feedback progression), and keep chatbot conversation history (optional, toggle-based).

## Style Guidelines:

- Primary colors: Light blue and light green for a professional and reassuring feel.
- Accent color: Teal (#008080) for interactive elements and CTAs.
- Minimalist icons (e.g., Lucide or Feather Icons) for clear and intuitive navigation.
- Simple sidebar navigation for easy access to different sections of the app.
- Subtle loading animations during AI calls to provide a smooth user experience.

## Original User Request:
Tu es un expert en développement d’applications web professionnelles (type SaaS).
Je veux que tu conçois une application web MVP fonctionnelle pour un projet santé appelé Kinebot.

🎯 Contexte du projet :
Kinebot est une application web pour kinésithérapeutes et patients.
Elle permet aux kinés de générer des programmes d'exercices personnalisés via une IA, et aux patients de suivre leur programme, donner un feedback, et dialoguer avec un chatbot IA santé.

Le but du MVP est de lancer une première version commercialisable, en conservant les deux fonctions clés suivantes :

✅ Génération automatique de programme de rééducation (via OpenAI)

✅ Chatbot IA accompagnant le patient

🛠️ Technologies à utiliser
Frontend : React ou Next.js (idéalement avec Tailwind CSS)

Backend : Firebase (Auth, Firestore, Functions, Hosting)

Appels IA : via OpenAI API

Hosting : Firebase Hosting ou Vercel

Authentification : Firebase Email/Password (2 rôles : kiné, patient)

📋 Fonctionnalités à inclure absolument
🔐 Authentification (Firebase Auth)
Formulaire de connexion et inscription

Rôle attribué automatiquement : kine ou patient

🧑‍⚕️ Dashboard Kiné
Liste de ses patients

Visualiser les feedbacks reçus par patient

Formulaire de création de programme :

Objectifs cliniques à choisir (ex : renforcement quadriceps)

Niveaux de difficulté

Matériel dispo

Durée souhaitée

Bouton "Générer programme" ➔ appel backend à OpenAI

Aperçu du programme généré + possibilité de modifier

🧍 Dashboard Patient
Voir programme d'exercices avec :

Titre, description, fréquence, répétitions

Rendu propre avec icône ou mini-illustration par exercice

Feedback post-séance :

Échelle douleur (0–10)

Échelle fatigue (0–10)

Commentaire libre

Chatbot IA simple pour :

Comprendre les exercices

Se motiver

Poser des questions santé basiques (pas de diagnostic)

🧠 Intégration IA (Backend Firebase Function)
generateProgram() ➔ Appel API OpenAI avec prompt structuré

patientChatbot() ➔ Appel API OpenAI avec contexte rôle "coach santé bienveillant"

Prévoir structure future pour historisation des conversations

🔔 Notifications
Notification interne : "Votre kiné a mis à jour votre programme"

Notification de rappel post-feedback

Préparer l’espace pour futur système de notification push

🧱 Base de données Firestore (schéma minimal)
users: id, nom, email, rôle, patients liés

programmes: id_kine, id_patient, objectif, niveau, contenu généré

feedbacks: id_programme, date, douleur, fatigue, commentaire

exercises: liste d’exercices disponibles pour IA

🎨 Design (UX/UI) – Directives inspirées des meilleurs standards web
Inspiration visuelle : Notion, Linear, Apple Santé, Duolingo, Calm

Tailwind CSS + composantes modernes

Palette claire, professionnelle, rassurante (bleu/vert/gris clair)

Icônes claires, pictos minimalistes (Lucide, Feather Icons)

Navigation simple en barre latérale

Mobile-first : tous les écrans doivent être 100% responsive

Loaders élégants lors des appels à l’IA

Feedback visuel de progression (ex : badge "programme complété à 60%")

🧩 Préparation future (anticipation intégration V2+)
Prévois ces éléments structurels dès le MVP :

Un module "Ventes de programmes kiné" (non actif mais prêt)

Préparation pour intégration Stripe

Un module de notifications extensible (email + push plus tard)

Historique des chats IA (stockable à activer plus tard)

Statistiques de progression (graphique feedback)

💬 Appels à l’action / Marketing intégré
Sur dashboard patient : "Passez en Premium pour débloquer + de contenu IA"

Sur dashboard kiné : "Invitez vos patients à s’abonner – vous gagnez 2€/mois/patient actif"

Prévoir visuel de revenus d’affiliation pour kiné dans son profil

🎯 Objectif final du prompt
Livrer une webapp MVP fonctionnelle, prête à être testée avec de vrais kinés et patients,
permettant :

La gestion patients

La génération IA de programme

Le chatbot IA patient

Le feedback de suivi

L’hébergement Firebase/Vercel

Design responsive, fluide, moderne, orienté conversion.

✅ À toi de jouer
Tu dois me livrer :

Le code source React complet de l’app MVP

Une base Firestore pré-remplie (exemples patients/exercices)

L’architecture des fonctions Firebase pour l’IA

Le code Tailwind + design cohérent avec les standards UX

La possibilité de déployer l’app sur Vercel ou Firebase Hosting

📦 Résultat attendu :
Une app web prête à être testée par des kinés et capable de générer des ventes dès les premières semaines.
  