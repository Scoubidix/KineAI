require('dotenv').config()
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');

// Import des routes
const kinesRoutes = require('./routes/kines');
const patientsRoutes = require('./routes/patients');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Routes
app.use('/kine', kinesRoutes);      // Route pour les kinés
app.use('/patients', patientsRoutes); // Route pour les patients

// Test route
app.get('/', (req, res) => {
  res.send('Bienvenue sur l’API KinéAI 🧠');
});

// Démarrage du serveur
app.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur le port ${PORT}`);
});

