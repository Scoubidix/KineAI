const { OpenAI } = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Fonction pour anonymiser les données patient
const anonymizePatientData = (patient, programmes) => {
  return {
    patientInfo: {
      age: calculateAge(patient.birthDate),
      genre: patient.genre || 'Non spécifié', // Si vous avez ce champ
      identifier: `Patient ${patient.id.toString().slice(-3)}` // Ex: "Patient 123"
    },
    programmes: programmes.map(prog => ({
      titre: prog.titre,
      description: prog.description,
      duree: prog.duree,
      exercices: prog.exercices?.map(ex => ({
        nom: ex.exerciceModele?.nom || ex.nom,
        series: ex.series,
        repetitions: ex.repetitions,
        pause: ex.pause || ex.tempsRepos,
        consigne: ex.consigne || ex.instructions
      })) || []
    }))
  };
};

// Calculer l'âge
const calculateAge = (birthDateStr) => {
  const birthDate = new Date(birthDateStr);
  const ageDiff = Date.now() - birthDate.getTime();
  return Math.floor(ageDiff / (1000 * 60 * 60 * 24 * 365.25));
};

// Générer le prompt système personnalisé
const generateSystemPrompt = (anonymizedData) => {
  const { patientInfo, programmes } = anonymizedData;
  
  return `Tu es un assistant kinésithérapeute virtuel bienveillant et professionnel. 

CONTEXTE PATIENT:
- Identifiant: ${patientInfo.identifier}
- Âge: ${patientInfo.age} ans
- Genre: ${patientInfo.genre}

PROGRAMME(S) ACTUEL(S):
${programmes.map(prog => `
📋 ${prog.titre}
Description: ${prog.description}
Durée: ${prog.duree} jours

Exercices:
${prog.exercices.map(ex => `
• ${ex.nom}
  - ${ex.series} séries de ${ex.repetitions} répétitions
  - Pause: ${ex.pause}s entre les séries
  ${ex.consigne ? `- Consignes: ${ex.consigne}` : ''}
`).join('')}
`).join('\n')}

INSTRUCTIONS:
1. Réponds uniquement aux questions liées à la kinésithérapie et au programme du patient
2. Sois bienveillant, rassurant et encourageant
3. Utilise un langage simple et accessible
4. Si on te pose des questions médicales complexes, redirige vers le kinésithérapeute
5. Rappelle régulièrement l'importance de suivre le programme
6. Ne donne jamais d'informations personnelles du patient
7. En cas de douleur intense, conseille d'arrêter et de consulter

TONE: Professionnel mais chaleureux, comme un kinésithérapeute expérimenté et bienveillant.`;
};

// Fonction principale pour le chat
const generateChatResponse = async (patientData, programmes, userMessage, chatHistory = []) => {
  try {
    // Anonymiser les données
    const anonymizedData = anonymizePatientData(patientData, programmes);
    
    // Générer le prompt système
    const systemPrompt = generateSystemPrompt(anonymizedData);
    
    // Préparer les messages pour OpenAI
    const messages = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: userMessage }
    ];

    // Appel à OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: messages,
      max_tokens: 500,
      temperature: 0.7,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });

    return {
      success: true,
      message: response.choices[0].message.content,
      usage: response.usage
    };

  } catch (error) {
    console.error('Erreur OpenAI:', error);
    return {
      success: false,
      error: 'Désolé, je rencontre un problème technique. Veuillez réessayer dans quelques instants.',
      details: error.message
    };
  }
};

// Fonction pour générer un message d'accueil personnalisé
const generateWelcomeMessage = async (patientData, programmes) => {
  try {
    const anonymizedData = anonymizePatientData(patientData, programmes);
    const systemPrompt = generateSystemPrompt(anonymizedData);
    
    const welcomePrompt = `Génère un message d'accueil personnalisé pour ce patient. 
    Présente-toi, résume son programme du jour de manière encourageante, et invite-le à poser des questions.
    Sois chaleureux et motivant. Maximum 150 mots.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: welcomePrompt }
      ],
      max_tokens: 200,
      temperature: 0.8
    });

    return {
      success: true,
      message: response.choices[0].message.content
    };

  } catch (error) {
    console.error('Erreur génération message d\'accueil:', error);
    return {
      success: false,
      message: "Bonjour ! Je suis votre assistant kinésithérapeute virtuel. Je suis là pour vous accompagner dans votre programme d'exercices et répondre à vos questions. Comment puis-je vous aider aujourd'hui ?"
    };
  }
};

module.exports = {
  generateChatResponse,
  generateWelcomeMessage,
  anonymizePatientData
};