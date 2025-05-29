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

//PUT / Patients
// PUT /patients
exports.updatePatient = async (req, res) => {
  const { id } = req.params;
  const {
    firstName,
    lastName,
    birthDate,
    email,
    phone,
    goals,
    kineId
  } = req.body;

  try {
    const patient = await prisma.patient.update({
      where: { id },
      data: {
        firstName,
        lastName,
        birthDate: new Date(birthDate),
        email,
        phone,
        goals,
        kineId
      }
    });
    res.json(patient);
  } catch (err) {
    console.error("Erreur update patient :", err);
    res.status(500).json({ error: "Erreur modification patient" });
  }
};


//DELETE /Patients
exports.deletePatient = async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.patient.delete({
      where: { id },
    });
    res.status(200).json({ message: 'Patient supprimé' });
  } catch (error) {
    console.error('Erreur suppression patient :', error);
    res.status(500).json({ error: 'Erreur suppression patient' });
  }
};
