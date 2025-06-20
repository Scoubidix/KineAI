const prismaService = require('../services/prismaService');

const createKine = async (req, res) => {
  const { uid, email, firstName, lastName, phone, rpps, adresseCabinet, birthDate } = req.body;

  console.log("📥 Données reçues pour création kiné :", req.body);

  try {
    const prisma = prismaService.getInstance();
    
    const existing = await prisma.kine.findUnique({
      where: { uid },
    });

    if (existing) {
      return res.status(409).json({ error: 'Un kiné avec ce UID existe déjà.' });
    }

    const newKine = await prisma.kine.create({
      data: {
        uid,
        email,
        firstName,
        lastName,
        phone,
        rpps,
        adresseCabinet,
        birthDate: new Date(birthDate),
      },
    });

    console.log("✅ Kiné créé :", newKine);

    return res.status(201).json(newKine);
  } catch (err) {
    console.error("❌ Erreur création kiné :", err);
    return res.status(500).json({ error: 'Erreur serveur lors de la création du kiné.' });
  }
};

module.exports = { createKine };