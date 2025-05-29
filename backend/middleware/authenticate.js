const admin = require('../firebase/firebase');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn("⚠️ Aucun token fourni ou format invalide.");
    return res.status(401).json({ message: "Token manquant ou invalide." });
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log("✅ Token vérifié avec succès. UID :", decodedToken.uid);
    req.uid = decodedToken.uid;
    next();
  } catch (error) {
    console.error("❌ Erreur de vérification du token :", error);
    return res.status(401).json({ message: "Token invalide." });
  }
};

module.exports = { authenticate };
