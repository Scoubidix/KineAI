// ============================================================
// HELPERS — App factory + données mock + utilitaires
// ============================================================

const express = require('express');

// Créer une app Express minimale pour les tests (sans CORS, helmet, rate limiters)
function createApp() {
  const app = express();
  app.use(express.json());
  return app;
}

// Header d'authentification valide (Firebase mock accepte n'importe quel token)
const AUTH_HEADER = { Authorization: 'Bearer test-firebase-token' };

// ===== DONNÉES MOCK =====

const MOCK_KINE = {
  id: 1,
  uid: 'test-firebase-uid',
  email: 'test@kine.fr',
  firstName: 'Jean',
  lastName: 'Dupont',
  phone: '0612345678',
  rpps: '12345678901',
  adresseCabinet: '10 rue de la Santé, 75013 Paris',
  planType: 'EXPERT',
  subscriptionId: 'sub_mock_expert',
  stripeCustomerId: null,
  referralCode: 'ABC123',
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-06-01'),
};

const MOCK_KINE_FREE = {
  ...MOCK_KINE,
  id: 2,
  uid: 'test-free-uid',
  email: 'free@kine.fr',
  planType: 'FREE',
  subscriptionId: null,
  trialEndDate: null,
};

const MOCK_KINE_DECLIC = {
  ...MOCK_KINE,
  id: 3,
  uid: 'test-declic-uid',
  email: 'declic@kine.fr',
  planType: 'DECLIC',
  subscriptionId: 'sub_mock_declic',
};

const MOCK_KINE_PRATIQUE = {
  ...MOCK_KINE,
  id: 4,
  uid: 'test-pratique-uid',
  email: 'pratique@kine.fr',
  planType: 'PRATIQUE',
  subscriptionId: 'sub_mock_pratique',
};

const MOCK_PATIENT = {
  id: 1,
  firstName: 'Marie',
  lastName: 'Martin',
  birthDate: new Date('1990-01-15'),
  email: 'marie@patient.fr',
  phone: '0698765432',
  goals: 'Récupération genou droit',
  kineId: 1,
  isActive: true,
  emailConsent: true,
  whatsappConsent: true,
  createdAt: new Date('2025-03-01'),
  updatedAt: new Date('2025-03-01'),
};

const MOCK_PROGRAMME = {
  id: 1,
  titre: 'Rééducation genou',
  description: 'Programme post-opératoire LCA',
  duree: 30,
  dateDebut: new Date('2025-06-01'),
  dateFin: new Date('2025-07-01'),
  isArchived: false,
  archivedAt: null,
  isActive: true,
  deletedAt: null,
  patientId: 1,
  createdAt: new Date('2025-06-01'),
  updatedAt: new Date('2025-06-01'),
};

const MOCK_NOTIFICATION = {
  id: 1,
  type: 'DAILY_VALIDATION',
  title: 'Validation journalière',
  message: 'Marie Martin a validé sa séance',
  isRead: false,
  kineId: 1,
  patientId: 1,
  programmeId: 1,
  metadata: { painLevel: 3 },
  createdAt: new Date('2025-06-15'),
};

const MOCK_CONTACT = {
  id: 1,
  kineId: 1,
  firstName: 'Dr',
  lastName: 'Médecin',
  email: 'medecin@test.fr',
  phone: '0612345678',
  type: 'Médecin',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_TEMPLATE = {
  id: 1,
  title: 'Rappel RDV',
  category: 'Gestion RDV',
  subject: 'Rappel de votre rendez-vous',
  body: 'Bonjour [Nom Patient], rappel pour votre RDV du [Date].',
  tags: ['rdv', 'rappel'],
  usageCount: 5,
  isPublic: true,
  kineId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_EXERCICE = {
  id: 1,
  kineId: 1,
  nom: 'Squat isométrique',
  description: 'Squat contre le mur, maintien 30s',
  gifUrl: null,
  gifPath: null,
  tags: 'genou,quadriceps',
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_CONTACT_KINE = {
  id: 1,
  kineId: 1,
  firstName: 'Pierre',
  lastName: 'Confrère',
  email: 'pierre@kine.fr',
  phone: '0611111111',
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_CONTRACT = {
  id: 1,
  kineInitiateurId: 1,
  type: 'REMPLACEMENT_LIBERAL',
  roleInitiateur: 'TITULAIRE',
  contactKineId: 1,
  kineDestinataireId: null,
  destinataireFirstName: 'Pierre',
  destinataireLastName: 'Confrère',
  destinataireEmail: 'pierre@kine.fr',
  destinatairePhone: '0611111111',
  data: {},
  status: 'BROUILLON',
  pdfFinalUrl: null,
  accessToken: null,
  accessTokenEmailHash: null,
  accessTokenPhoneHash: null,
  accessTokenExpiresAt: null,
  accessTokenUsedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  completedAt: null,
};

const MOCK_REFERRAL = {
  id: 1,
  referrerId: 1,
  refereeId: 2,
  planSubscribed: 'PRATIQUE',
  creditAmount: 19,
  status: 'PENDING',
  referrerCredited: false,
  refereeCredited: false,
  refereeEmail: 'filleul@test.fr',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Récupérer le mock Prisma client depuis le mock prismaService
function getMockPrisma() {
  const prismaService = require('../services/prismaService');
  return prismaService.__mockClient;
}

module.exports = {
  createApp,
  AUTH_HEADER,
  getMockPrisma,
  MOCK_KINE,
  MOCK_KINE_FREE,
  MOCK_KINE_DECLIC,
  MOCK_KINE_PRATIQUE,
  MOCK_PATIENT,
  MOCK_PROGRAMME,
  MOCK_NOTIFICATION,
  MOCK_CONTACT,
  MOCK_TEMPLATE,
  MOCK_EXERCICE,
  MOCK_REFERRAL,
  MOCK_CONTACT_KINE,
  MOCK_CONTRACT,
};
