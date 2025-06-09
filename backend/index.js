require('dotenv').config()
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Import des routes
const kinesRoutes = require('./routes/kines');
const patientsRoutes = require('./routes/patients');
const programmeRoutes = require('./routes/programmes');
const exerciceRoutes = require('./routes/exercices');
const testOpenAIRoutes = require('./routes/testOpenAI');
const patientChatRoutes = require('./routes/patientChat'); // ← NOUVEAU

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Routes
app.use('/kine', kinesRoutes);
app.use('/patients', patientsRoutes);
app.use('/programmes', programmeRoutes);
app.use('/exercices', exerciceRoutes);
app.use('/api/test', testOpenAIRoutes);
app.use('/api/patient', patientChatRoutes); // ← NOUVEAU

// Test route
app.get('/', (req, res) => {
  res.send('Bienvenue sur l API KineAI');
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur le port ${PORT}`);
});