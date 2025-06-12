const admin = require('../firebase/firebase');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    const ip = req.ip || req.connection.remoteAddress;
    console.warn(`🚨 AUTH: Token manquant - IP: ${ip} - Route: ${req.path}`);
    return res.status(401).json({ message: "Token manquant ou invalide." });
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.uid = decodedToken.uid;
    req.userEmail = decodedToken.email; // Utile pour logs métier
    
    // ✅ Log uniquement les NOUVELLES connexions (première requête de la session)
    // Détection simple : si c'est une route de "connexion" ou première action
    if (req.path.includes('/dashboard') || req.path.includes('/patients')) {
      console.log(`🔐 AUTH: Kiné connecté ${decodedToken.email} - IP: ${req.ip}`);
    }
    
    next();
  } catch (error) {
    const ip = req.ip || req.connection.remoteAddress;
    
    // ✅ Log toujours les ÉCHECS (sécurité critique)
    console.error(`❌ AUTH: Token invalide - IP: ${ip} - Route: ${req.path} - Erreur: ${error.code}`);
    
    return res.status(401).json({ message: "Token invalide." });
  }
};

module.exports = { authenticate };