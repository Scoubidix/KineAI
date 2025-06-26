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

const getKineProfile = async (req, res) => {
  const uid = req.uid; // Récupéré depuis le middleware authenticate

  console.log("📥 Récupération profil kiné pour UID :", uid);

  try {
    const prisma = prismaService.getInstance();
    
    const kine = await prisma.kine.findUnique({
      where: { uid },
      include: {
        patients: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          }
        },
        _count: {
          select: {
            patients: true,
            exercicesModeles: true,
          }
        }
      }
    });

    if (!kine) {
      console.log("❌ Kiné non trouvé pour UID :", uid);
      return res.status(404).json({ error: 'Kiné non trouvé dans la base de données.' });
    }

    console.log("✅ Profil kiné récupéré :", {
      id: kine.id,
      email: kine.email,
      firstName: kine.firstName,
      lastName: kine.lastName
    });

    return res.status(200).json(kine);
  } catch (err) {
    console.error("❌ Erreur récupération profil kiné :", err);
    return res.status(500).json({ error: 'Erreur serveur lors de la récupération du profil.' });
  }
};

module.exports = { createKine, getKineProfile };