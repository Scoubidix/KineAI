import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

export const getPatientsByKine = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).send("Unauthorized");
    return;
  }

  try {
    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const snapshot = await admin.firestore()
      .collection("users")
      .where("role", "==", "patient")
      .where("linkedKine", "==", uid)
      .get();

    const patients = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(patients);
  } catch (err) {
    console.error("Erreur lors de la récupération des patients:", err);
    res.status(500).send("Erreur interne");
  }
});
