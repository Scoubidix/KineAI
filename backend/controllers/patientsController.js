const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

// GET /patients
exports.getPatients = async (req, res) => {
  const { kineId } = req.params;

  try {
    const patients = await prisma.patient.findMany({
      where: { kineId }
    });
    res.json(patients);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur récupération patients" });
  }
};


// POST /patients
exports.createPatient = async (req, res) => {
  const {
    firstName,
    lastName,
    birthDate,
    email,
    phone,
    goals,
    kineId
  } = req.body

  try {
    const newPatient = await prisma.patient.create({
      data: {
        firstName,
        lastName,
        birthDate: new Date(birthDate),
        email,
        phone,
        goals,
        kineId
      }
    })
    res.status(201).json(newPatient)
  } catch (err) {
    console.error("Erreur création patient :", err)
    res.status(500).json({ error: "Erreur création patient" })
  }
}
