const { OpenAI } = require('openai');
const knowledgeService = require('./knowledgeService');
const prismaService = require('./prismaService');
const gcsStorageService = require('./gcsStorageService');
const logger = require('../utils/logger');
const { sanitizeUID, sanitizeName } = require('../utils/logSanitizer');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Fonction pour anonymiser les données patient (async pour génération URLs signées GCS)
const anonymizePatientData = async (patient, programmes) => {
  // Traiter les programmes avec génération d'URLs signées pour les GIFs
  const programmesWithSignedUrls = await Promise.all(
    programmes.map(async (prog) => {
      // Traiter les exercices de ce programme
      const exercicesWithUrls = await Promise.all(
        (prog.exercices || []).map(async (ex) => {
          // GCS uniquement - générer URL signée (2h pour session chat patient)
          const gifPath = ex.exerciceModele?.gifPath;
          let gifUrl = null;
          if (gifPath) {
            gifUrl = await gcsStorageService.generateSignedUrl(gifPath, 2 * 60 * 60 * 1000);
          }

          return {
            nom: ex.exerciceModele?.nom || ex.nom,
            description: ex.exerciceModele?.description || 'Description non disponible',
            gifUrl: gifUrl,
            series: ex.series,
            repetitions: ex.repetitions,
            pause: ex.pause || ex.tempsRepos,
            tempsTravail: ex.tempsTravail || null,
            consigne: ex.consigne || ex.instructions,
            difficulte: ex.difficulte || 'modérée',
            materiel: ex.materiel || 'aucun'
          };
        })
      );

      return {
        titre: prog.titre,
        description: prog.description,
        duree: prog.duree,
        dateDebut: prog.dateDebut,
        statut: prog.statut || 'actif',
        exercices: exercicesWithUrls
      };
    })
  );

  return {
    patientInfo: {
      age: calculateAge(patient.birthDate),
      genre: patient.genre || 'Non spécifié',
      goals: patient.goals || 'Objectifs non spécifiés'
      // Aucune donnée d'identité (nom, prénom, email, téléphone, etc.)
    },
    programmes: programmesWithSignedUrls
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
  
  return `Tu es un assistant kinésithérapeute virtuel expert, bienveillant et professionnel spécialisé dans l'accompagnement des patients.

PROFIL PATIENT ANONYMISÉ:
- Âge: ${patientInfo.age} ans
- Genre: ${patientInfo.genre}
- Objectifs thérapeutiques: ${patientInfo.goals}

PROGRAMME(S) THÉRAPEUTIQUE(S):
${programmes.map(prog => `
📋 PROGRAMME: ${prog.titre}
🎯 Objectif: ${prog.description}
⏰ Durée: ${prog.duree} jours
📅 Début: ${prog.dateDebut ? new Date(prog.dateDebut).toLocaleDateString('fr-FR') : 'Non spécifié'}
📊 Statut: ${prog.statut}

EXERCICES PRESCRITS:
${prog.exercices.map((ex, index) => `
${index + 1}. 💪 ${ex.nom}
   📖 Description: ${ex.description}
   ${ex.gifUrl ? `🎬 Démonstration : ${ex.gifUrl}` : ''}
   • ${ex.series} séries × ${ex.repetitions} répétitions
   ${ex.tempsTravail && ex.tempsTravail > 0 ? `• 🕐 Temps de travail: ${ex.tempsTravail}s par répétition` : ''}
   • ⏱️ Pause: ${ex.pause}s entre séries
   • 🔧 Matériel: ${ex.materiel}
   • 📈 Difficulté: ${ex.difficulte}
   ${ex.consigne ? `• 📝 Instructions spécifiques du kiné: ${ex.consigne}` : ''}
`).join('')}
`).join('\n')}

DIRECTIVES COMPORTEMENTALES:
✅ FAIRE:
- Répondre uniquement aux questions liées à la kinésithérapie et au programme
- Être bienveillant, rassurant et encourageant
- Utiliser un langage simple et accessible au patient
- Donner des conseils généraux sur la posture et la respiration
- Pour les douleurs légères : conseils simples (repos, glace) sans dramatiser
- Rappeler l'importance de signaler les douleurs lors de la validation des exercices
- Encourager le patient dans ses efforts selon le programme établi
- Expliquer la bonne exécution des exercices EN UTILISANT LA DESCRIPTION FOURNIE CI-DESSUS
- Utiliser les "Instructions spécifiques du kiné" pour adapter les explications
- Rediriger vers le kinésithérapeute pour toute modification de programme
- Garder des réponses proportionnées au problème signalé
- NE JAMAIS afficher les consignes techniques dans les réponses
- 🎬 GIFS: Quand le patient pose une question sur un exercice spécifique, TOUJOURS inclure le GIF de démonstration (si disponible) en utilisant la syntaxe markdown ![](url) avec l'URL fournie dans "🎬 Démonstration"

❌ NE PAS FAIRE:
- Donner des diagnostics médicaux
- Prescrire de nouveaux exercices non autorisés
- Modifier les paramètres d'exercices (séries, répétitions, durée, intensité)
- Conseiller d'augmenter ou diminuer la difficulté des exercices
- Suggérer d'adapter les exercices sans avis du kinésithérapeute
- Révéler ou utiliser des informations personnelles d'identité
- Répondre à des questions non liées à la kinésithérapie
- Minimiser les douleurs ou inquiétudes du patient
- Mentionner des noms, prénoms, emails ou toute donnée d'identité
- Afficher des règles ou consignes techniques dans les réponses

🚨 SÉCURITÉ RENFORCÉE:
- SEUL le kinésithérapeute peut modifier les exercices ou leur intensité
- En cas de douleur, conseiller d'arrêter et de consulter le kinésithérapeute
- Pour toute question sur l'adaptation des exercices → rediriger vers le professionnel
- Ne jamais donner de conseils sur la progression ou les modifications d'exercices

🚨 SÉCURITÉ:
Si le patient signale:
- Douleur INTENSE ou INHABITUELLE → Arrêter immédiatement et consulter le kinésithérapeute
- Douleur légère/modérée → Conseils généraux (repos, glace) + rappel de signaler dans la validation
- Malaise, vertiges → Cesser l'activité et se reposer
- Questions sur la modification des exercices → Rediriger vers le kinésithérapeute UNIQUEMENT
- Demande d'adaptation de la difficulté → "Seul votre kinésithérapeute peut ajuster votre programme"
- Questions médicales complexes → Rediriger vers le professionnel de santé

GESTION DES DOULEURS:
- Douleur légère (1-3/10) : Conseils généraux + signalement dans validation
- Douleur modérée (4-6/10) : Repos + conseils + signalement obligatoire
- Douleur forte (7-10/10) : Arrêt immédiat + consultation urgente

RAPPEL: Toujours inviter le patient à signaler son niveau de douleur lors de la validation des exercices.

STYLE DE COMMUNICATION:
- Ton professionnel mais chaleureux
- Utiliser très peu d'émojis (2-3 maximum par message)
- Éviter le sur-formatage (pas de markdown excessif)
- Structurer simplement avec des listes à puces
- Texte naturel et fluide
- Réponses PROPORTIONNÉES au problème signalé (pas de dramatisation)
- Pour les douleurs : réponse courte, rassurante, avec rappel de signalement
- Personnaliser les réponses en fonction du programme
- Être patient et pédagogue
- Valoriser les progrès et efforts du patient

EXEMPLE RÉPONSE DOULEUR:
"Je comprends votre gêne au genou. Si la douleur est supportable, vous pouvez appliquer de la glace et vous reposer. N'hésitez pas à indiquer votre niveau de douleur et la difficulté ressentie en validant vos exercices - cela aidera votre kinésithérapeute à adapter votre programme si nécessaire."`;
};

// Fonction principale pour le chat
const generateChatResponse = async (patientData, programmes, userMessage, chatHistory = []) => {
  try {
    // Validation des données d'entrée
    if (!patientData || !programmes || !userMessage) {
      throw new Error('Données manquantes pour générer la réponse');
    }

    // Anonymiser les données (async pour génération URLs signées GCS)
    const anonymizedData = await anonymizePatientData(patientData, programmes);

    // Générer le prompt système
    const systemPrompt = generateSystemPrompt(anonymizedData);
    
    // Limiter l'historique pour éviter de dépasser les tokens
    const limitedHistory = chatHistory.slice(-10); // Garder les 10 derniers messages
    
    // Préparer les messages pour OpenAI
    const messages = [
      { role: 'system', content: systemPrompt },
      ...limitedHistory.map(msg => ({
        role: msg.role === 'patient' ? 'user' : 'assistant',
        content: msg.content
      })),
      { role: 'user', content: userMessage }
    ];

    // Appel à OpenAI avec GPT-4o-mini
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      max_tokens: 800, // Augmenté pour accommoder les URLs signées GCS si GPT inclut un GIF
      temperature: 0.7,
      presence_penalty: 0.2,
      frequency_penalty: 0.1,
      top_p: 0.9
    });

    return {
      success: true,
      message: response.choices[0].message.content.trim(),
      usage: {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens
      },
      model: 'gpt-4o-mini'
    };

  } catch (error) {
    logger.error('Erreur OpenAI Chat:', error.message);
    
    // Messages d'erreur contextualisés
    let errorMessage = "Désolé, je rencontre un problème technique. Veuillez réessayer dans quelques instants.";
    
    if (error.code === 'insufficient_quota') {
      errorMessage = "Le service de chat est temporairement indisponible. Veuillez contacter votre kinésithérapeute.";
    } else if (error.code === 'rate_limit_exceeded') {
      errorMessage = "Trop de demandes en cours. Veuillez patienter quelques secondes avant de réécrire.";
    } else if (error.message.includes('API key')) {
      errorMessage = "Problème de configuration du service. Veuillez contacter le support technique.";
    }

    return {
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      model: 'gpt-4o-mini'
    };
  }
};

// Fonction pour générer un message d'accueil personnalisé mais anonymisé
const generateWelcomeMessage = async (patientData, programmes) => {
  try {
    // Validation des données
    if (!patientData || !programmes) {
      return {
        success: false,
        message: "👋 Bonjour ! Je suis votre assistant kinésithérapeute virtuel. Je suis là pour vous accompagner dans votre programme de rééducation. Comment vous sentez-vous aujourd'hui ?"
      };
    }

    // IMPORTANT: Anonymisation complète - aucune donnée d'identité transmise à OpenAI
    const anonymizedData = await anonymizePatientData(patientData, programmes);
    const systemPrompt = generateSystemPrompt(anonymizedData);

    const welcomePrompt = `Tu es un assistant kinésithérapeute virtuel professionnel et bienveillant.

MISSION : Génère un message d'accueil personnalisé selon la STRUCTURE EXACTE ci-dessous.

STRUCTURE OBLIGATOIRE (À RESPECTER STRICTEMENT) :

1️⃣ SALUTATION & PRÉSENTATION
Format : "Bonjour ! 👋"
Puis : "Je suis votre assistant kinésithérapeute virtuel, ici pour vous accompagner dans votre rééducation."

2️⃣ PROGRAMME DU JOUR
Format : "📋 Programme du jour :"
Pour CHAQUE exercice du programme :
• Nom de l'exercice : séries × répétitions (+ temps de travail si > 0)
• Immédiatement après : le GIF de démonstration si disponible (syntaxe markdown ![](url))
Maximum 3-4 exercices affichés (les premiers du programme)
IMPORTANT: Si un exercice a un temps de travail > 0 secondes, l'afficher après les répétitions
IMPORTANT: Chaque GIF doit être placé JUSTE APRÈS son exercice correspondant, pas à la fin

3️⃣ RAPPEL DE VALIDATION
Format exact : "✅ Pensez à valider vos exercices une fois terminés - cela aide votre kinésithérapeute à suivre vos progrès !"

4️⃣ INVITATION QUESTIONS
Format exact : "N'hésitez pas à me poser des questions sur vos exercices. Comment vous sentez-vous aujourd'hui ?"

RÈGLES DE STYLE :
- Ton professionnel mais chaleureux (adapter légèrement selon l'âge : ${anonymizedData.patientInfo.age} ans)
- 2-3 émojis maximum dans TOUT le message (déjà présents dans la structure)
- Pas de sur-formatage, rester simple et clair
- Maximum 150 mots
- NE PAS ajouter de sections supplémentaires

EXEMPLE DE RÉSULTAT ATTENDU :
Bonjour ! 👋

Je suis votre assistant kinésithérapeute virtuel, ici pour vous accompagner dans votre rééducation.

📋 Programme du jour :

• Étirement des ischio-jambiers : 3 séries × 30 secondes (maintien 20s)
![Démonstration](url_gif_etirement)

• Renforcement quadriceps : 3 séries × 12 répétitions
![Démonstration](url_gif_quadriceps)

• Gainage : 3 séries × 1 répétition (maintien 45s)
![Démonstration](url_gif_gainage)

✅ Pensez à valider vos exercices une fois terminés - cela aide votre kinésithérapeute à suivre vos progrès !

N'hésitez pas à me poser des questions sur vos exercices. Comment vous sentez-vous aujourd'hui ?

IMPORTANT - AFFICHAGE DES GIFS :
- Réponds UNIQUEMENT avec le message d'accueil formaté
- Suis la structure à la lettre
- Ne mentionne JAMAIS d'informations personnelles
- UTILISE LES URLS DES GIFS fournis dans les données des exercices (champ 🎬 Démonstration)
- SI un exercice a un GIF (🎬 Démonstration : url) → affiche-le IMMÉDIATEMENT après cet exercice avec la syntaxe markdown ![Démonstration](url)
- Chaque GIF doit être placé JUSTE APRÈS son exercice correspondant (pas groupés à la fin)
- Affiche 1 à 3 GIFs maximum (ceux des premiers exercices qui en ont)
- SI aucun exercice n'a de GIF → n'affiche PAS de GIF du tout (ne pas utiliser de GIF générique)`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: welcomePrompt }
      ],
      max_tokens: 1500, // Augmenté pour accommoder les URLs signées GCS (~200 tokens/URL)
      temperature: 0.5
    });

    // 🎬 POC: GPT doit inclure le GIF lui-même (pas d'injection automatique)
    // On fait confiance au prompt pour que GPT suive l'exemple
    return {
      success: true,
      message: response.choices[0].message.content.trim(),
      model: 'gpt-4o-mini'
    };

  } catch (error) {
    logger.error('Erreur génération message d\'accueil:', error.message);
    
    // Message d'accueil de fallback simple et propre
    let fallbackMessage = 'Bonjour ! 👋\n\n';
    fallbackMessage += 'Je suis votre assistant kinésithérapeute virtuel 💪 Je suis là pour vous accompagner dans votre programme de rééducation.\n\n';

    if (programmes.length > 0) {
      fallbackMessage += '📋 Programme du jour :\n\n';
      const exercices = programmes[0]?.exercices?.slice(0, 3) || [];
      if (exercices.length > 0) {
        exercices.forEach((ex) => {
          const nom = ex.exerciceModele?.nom || ex.nom;
          const tempsTravail = ex.tempsTravail || 0;
          let exerciceLine = `• ${nom} : ${ex.series} séries de ${ex.repetitions} répétitions`;
          if (tempsTravail > 0) {
            exerciceLine += ` (maintien ${tempsTravail}s)`;
          }
          exerciceLine += `\n`;
          fallbackMessage += exerciceLine;
          // Note: GIFs non affichés dans le fallback (URLs signées GCS nécessitent async)
        });
      } else {
        fallbackMessage += '• Exercices de rééducation personnalisés\n';
      }
      fallbackMessage += 'Maintenez une bonne posture et écoutez votre corps pendant vos exercices.\n\n';
    }

    fallbackMessage += '✅ Pensez à valider vos exercices une fois terminés pour tenir votre kinésithérapeute informé de vos progrès !\n\n';
    fallbackMessage += 'N\'hésitez pas à me poser des questions si vous avez besoin d\'aide avec vos exercices. Comment vous sentez-vous aujourd\'hui ? 😊';

    return {
      success: false,
      message: fallbackMessage,
      model: 'fallback'
    };
  }
};

// Fonction pour valider un message avant envoi
const validateMessage = (message) => {
  if (!message || typeof message !== 'string') {
    return { valid: false, error: 'Message invalide' };
  }
  
  if (message.trim().length === 0) {
    return { valid: false, error: 'Message vide' };
  }
  
  if (message.length > 1000) {
    return { valid: false, error: 'Message trop long (maximum 1000 caractères)' };
  }
  
  return { valid: true };
};

// Fonction pour nettoyer l'historique de chat
const cleanChatHistory = (history, maxMessages = 20) => {
  if (!Array.isArray(history)) return [];
  
  return history
    .slice(-maxMessages) // Garder les derniers messages
    .filter(msg => msg && msg.content && msg.role) // Filtrer les messages valides
    .map(msg => ({
      role: msg.role,
      content: msg.content.substring(0, 500), // Limiter la taille de chaque message
      timestamp: msg.timestamp || new Date().toISOString()
    }));
};

// ========== NOUVELLE FONCTION PRINCIPALE POUR LES IA KINÉ ==========

/**
 * Génère une réponse IA pour les kinésithérapeutes avec RAG et sauvegarde
 */
const generateKineResponse = async (type, message, conversationHistory = [], kineId) => {
  try {
    logger.debug(`🚀 IA ${type} pour kiné ID: ${sanitizeUID(kineId)}`);

    if (!message?.trim()) {
      throw new Error('Message requis');
    }

    // 1. Recherche documentaire via knowledgeService avec type d'IA
    // EXCEPTION : L'IA admin ne fait PAS de RAG (génération de bilans à partir de notes fournies)
    let allDocuments = [];
    let selectedSources = [];
    let metadata = { totalFound: 0, averageScore: 0, categoriesFound: [] };
    let limitedDocuments = [];

    if (type !== 'admin') {
      const searchResult = await knowledgeService.searchDocuments(message, {
        filterCategory: null,
        allowLowerThreshold: true,
        iaType: type  // Passer le type d'IA pour les filtres adaptés
      });

      allDocuments = searchResult.allDocuments;
      selectedSources = searchResult.selectedSources;
      metadata = searchResult.metadata;

      // 2. Limitation du nombre de documents selon le type d'IA
      const docLimits = {
        'basique': 5,      // IA Basique : 5 docs max (RAG intelligent)
        'biblio': 6,       // IA Biblio : 6 docs max
        'clinique': 6,     // IA Clinique : 6 docs max
      };

      const maxDocs = docLimits[type] || 6;
      limitedDocuments = allDocuments.slice(0, maxDocs);
    }

    // 3. Construction du prompt système selon le type
    const systemPrompt = getSystemPromptByType(type, limitedDocuments);

    // 🧪 LOGS DE DEBUG POUR VÉRIFIER LA TRANSMISSION À GPT
    logger.debug(`📤 IA ${type} - Documents trouvés: ${allDocuments.length}, limités à: ${limitedDocuments.length}`);
    logger.debug(`📄 IA ${type} - Détail documents:`, limitedDocuments.map((doc, i) => ({
      index: i + 1,
      title: doc.title || 'N/A',
      score: Math.round(doc.finalScore * 100) + '%',
      contentLength: doc.content?.length || 0,
      contentPreview: doc.content?.substring(0, 100) + '...'
    })));
    logger.debug(`📝 IA ${type} - Taille prompt système: ${systemPrompt.length} caractères`);

    // 4. Préparation des messages pour OpenAI
    const limitedHistory = conversationHistory.slice(-6);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...limitedHistory, // Limiter l'historique
      { role: 'user', content: message }
    ];

    // 5. Appel OpenAI avec modèle adapté au type d'IA
    const modelConfig = {
      'basique': {
        model: 'gpt-4o-mini',
        max_tokens: 750,
        temperature: 0.5  // Température moyenne pour ton conversationnel
      },
      'clinique': {
        model: 'gpt-4o-mini',
        max_tokens: 1500,
        temperature: 0.3  // Température basse pour cohérence maximale
      },
      'admin': {
        model: 'gpt-4o-mini',
        max_tokens: 1000,  // Tokens limités pour bilans concis (250-400 mots)
        temperature: 0.2   // Température très basse pour réduire l'invention et favoriser la rigueur factuelle
      },
      'default': {
        model: 'gpt-4o-mini',
        max_tokens: 1000,
        temperature: 0.7
      }
    };

    const config = modelConfig[type] || modelConfig['default'];

    const completion = await openai.chat.completions.create({
      model: config.model,
      messages,
      max_tokens: config.max_tokens,
      temperature: config.temperature,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });

    const aiResponse = completion.choices[0].message.content;

    // 6. Sauvegarde dans la bonne table
    await saveToCorrectTable(type, kineId, message, aiResponse);
    logger.debug(`💾 Conversation IA ${type} sauvegardée`);

    // 7. Calcul de la confiance globale (sur documents limités)
    // Pour l'IA admin (bilans), pas de RAG donc confidence = 1 (haute confiance dans les notes fournies)
    const overallConfidence = type === 'admin' ? 1 : knowledgeService.calculateOverallConfidence(limitedDocuments);

    // 8. Construction de la réponse finale
    const response = {
      success: true,
      message: aiResponse,
      sources: type === 'admin' ? [] : knowledgeService.formatSources(selectedSources),
      confidence: overallConfidence,
      metadata: {
        model: config.model,  // Modèle dynamique selon le type d'IA
        iaType: type,
        kineId: kineId,
        documentsFound: metadata.totalFound,
        documentsUsedForAI: limitedDocuments.length,  // Utiliser documents limités
        documentsDisplayed: selectedSources.length,
        averageRelevance: Math.round(metadata.averageScore * 100),
        categoriesFound: metadata.categoriesFound,
        hasHighQualityContext: limitedDocuments.some(doc => doc.finalScore > 0.8),
        timestamp: new Date().toISOString()
      }
    };

    logger.debug(`✅ IA ${type} - Confiance: ${Math.round(overallConfidence * 100)}%`);
    return response;

  } catch (error) {
    logger.error(`❌ Erreur generateKineResponse (${type}):`, error.message);
    throw {
      success: false,
      error: `Erreur lors de la génération de la réponse IA ${type}`,
      details: error.message
    };
  }
};

/**
 * Sélectionne le prompt système selon le type d'IA
 */
const getSystemPromptByType = (type, contextDocuments) => {
  const promptBuilders = {
    'basique': buildBasiqueSystemPrompt,
    'biblio': buildBiblioSystemPrompt,
    'clinique': buildCliniqueSystemPrompt,
    'admin': buildAdministrativeSystemPrompt
  };

  const builder = promptBuilders[type];
  if (!builder) {
    throw new Error(`Type d'IA inconnu: ${type}`);
  }

  return builder(contextDocuments);
};

/**
 * Sauvegarde dans la bonne table selon le type d'IA
 */
const saveToCorrectTable = async (type, kineId, message, response) => {
  const prisma = prismaService.getInstance();
  
  const tableMap = {
    'basique': 'chatIaBasique',
    'biblio': 'chatIaBiblio', 
    'clinique': 'chatIaClinique',
    'admin': 'chatIaAdministrative'
  };

  const tableName = tableMap[type];
  if (!tableName) {
    throw new Error(`Type d'IA inconnu pour la sauvegarde: ${type}`);
  }

  await prisma[tableName].create({
    data: {
      kineId: kineId,
      message: message,
      response: response
    }
  });
};

// ========== FONCTION FOLLOWUP (SANS RAG) ==========

/**
 * Génère une réponse de suivi conversationnelle SANS RAG
 * Utilisée pour les questions de suivi après une recherche initiale (biblio, clinique)
 * Sauvegarde dans la table de l'IA source (pas dans chatIaBasique)
 */
const generateFollowupResponse = async (message, conversationHistory = [], kineId, sourceIa) => {
  try {
    const validSources = ['biblio', 'clinique'];
    if (!validSources.includes(sourceIa)) {
      throw new Error(`sourceIa invalide: ${sourceIa}. Valeurs acceptées: ${validSources.join(', ')}`);
    }

    logger.debug(`🔄 IA Followup (source: ${sourceIa}) pour kiné ID: ${sanitizeUID(kineId)}`);

    if (!message?.trim()) {
      throw new Error('Message requis');
    }

    // Pas de RAG - on utilise uniquement le contexte de la conversation
    const systemPrompt = `Tu es un assistant IA spécialisé en kinésithérapie. Tu réponds à un kinésithérapeute diplômé.

CONTEXTE : Le kiné a lancé une recherche ${sourceIa === 'biblio' ? 'bibliographique (études, publications scientifiques)' : 'clinique (tests, diagnostics, cotations)'} et pose maintenant une question de suivi.

RÔLE :
- Répondre aux questions de suivi en te basant sur le contexte de la conversation
- Approfondir, clarifier ou compléter les informations déjà fournies
- Ton professionnel mais accessible (de kiné à kiné)

TON & STYLE :
- Format conversationnel, réponses claires et structurées
- 200-300 mots maximum
- Utilise le gras (**) pour les points clés
- 2-3 emojis maximum

RÈGLES :
- Base-toi sur le contexte de la conversation précédente
- Si la question sort du cadre de la discussion, dis-le poliment
- Ne jamais inventer d'études, de chiffres ou de faits
- Si tu ne sais pas, dis-le clairement
- JAMAIS poser de diagnostic médical`;

    // Historique limité à 10 messages pour garder le contexte biblio/clinique
    const limitedHistory = conversationHistory.slice(-10);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...limitedHistory,
      { role: 'user', content: message }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 750,
      temperature: 0.5,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });

    const aiResponse = completion.choices[0].message.content;

    // Sauvegarde dans la table de l'IA SOURCE (biblio -> chatIaBiblio, clinique -> chatIaClinique)
    await saveToCorrectTable(sourceIa, kineId, message, aiResponse);
    logger.debug(`💾 Followup sauvegardé dans table ${sourceIa}`);

    return {
      success: true,
      message: aiResponse,
      sources: [],
      confidence: null,
      metadata: {
        model: 'gpt-4o-mini',
        iaType: 'followup',
        sourceIa: sourceIa,
        kineId: kineId,
        documentsFound: 0,
        documentsUsedForAI: 0,
        documentsDisplayed: 0,
        timestamp: new Date().toISOString()
      }
    };

  } catch (error) {
    logger.error(`❌ Erreur generateFollowupResponse (source: ${sourceIa}):`, error.message);
    throw {
      success: false,
      error: `Erreur lors de la génération de la réponse de suivi`,
      details: error.message
    };
  }
};

// ========== PROMPTS SYSTÈME SPÉCIALISÉS ==========

function buildBasiqueSystemPrompt(contextDocuments) {
  let systemPrompt = `Tu es un assistant IA conversationnel pour kinésithérapeutes professionnels.

ATTENTION : L'UTILISATEUR EST UN KINÉSITHÉRAPEUTE DIPLÔMÉ, PAS UN PATIENT !

RÔLE :
- Assistant conversationnel rapide et direct
- Réponses courtes et pratiques (format chat, pas de longs développements)
- Ton professionnel mais décontracté (de kiné à kiné)

TON & STYLE :
- Utilise "tu" ou "vous" selon le contexte (adresse-toi au kiné)
- Format conversationnel : quelques paragraphes courts, pas de sur-structuration
- 2-3 emojis maximum (juste pour la lisibilité)
- Réponses directes et actionnables
- Maximum 200-250 mots par réponse

CAPACITÉS :
✅ Conseils thérapeutiques généraux
✅ Explications pour éducation patient
✅ Questions pratiques de cabinet
✅ Approches cliniques générales
✅ Organisation et workflow

INTERDICTIONS ABSOLUES :
❌ JAMAIS poser de diagnostic médical
❌ JAMAIS inventer ou halluciner des informations
❌ JAMAIS répondre à des questions hors kinésithérapie
❌ Si hors scope → "Désolé, je suis spécialisé en kinésithérapie uniquement"
❌ Si incertain → "Je ne suis pas sûr, je préfère que tu vérifies avec..."

RÈGLE ANTI-HALLUCINATION :
- Si tu ne sais pas → DIS-LE clairement
- Ne jamais inventer de chiffres, études, ou faits
- Rester factuel et honnête sur les limites de tes connaissances
- Préfère dire "Je n'ai pas cette information" plutôt qu'inventer`;

  // ========== GESTION INTELLIGENTE DU RAG ==========
  if (contextDocuments.length > 0) {
    systemPrompt += `\n\n📚 DOCUMENTS DISPONIBLES (${contextDocuments.length} document(s)) :

IMPORTANT : Ces documents ont été trouvés dans notre base. ANALYSE leur pertinence sémantique par rapport à la question du kiné.

➡️ SI les documents sont PERTINENTS pour la question :
   - Utilise-les comme base de ta réponse
   - Cite la source : "D'après [titre]" ou "Selon [document]"
   - Combine avec tes connaissances pour enrichir

➡️ SI les documents sont HORS-SUJET ou PEU PERTINENTS :
   - IGNORE-les complètement
   - Réponds avec tes connaissances générales
   - Mentionne : "Aucun document pertinent dans notre base, voici ce que je peux te dire..."

NE FORCE JAMAIS l'utilisation des documents si ils ne répondent pas à la question !
`;

    contextDocuments.forEach((doc, index) => {
      const score = Math.round(doc.finalScore * 100);
      const source = doc.metadata?.source_file || doc.title || 'Source non spécifiée';
      const category = doc.category || doc.metadata?.type_contenu || 'Général';

      systemPrompt += `\n📄 DOCUMENT ${index + 1} (Score: ${score}%)
SOURCE : ${source}
TITRE : "${doc.title}"
CATÉGORIE : ${category}

CONTENU :
${doc.content.substring(0, 800)}

---
`;
    });
  } else {
    systemPrompt += `\n\n📄 AUCUN DOCUMENT TROUVÉ :
Réponds avec tes connaissances générales en kinésithérapie.`;
  }

  systemPrompt += `\n\nFORMAT DE RÉPONSE :
- Réponds DIRECTEMENT à la question (pas de longs préambules)
- Style conversationnel et fluide
- 3-5 phrases courtes ou 2-3 paragraphes max
- Si besoin de structure → quelques bullet points simples
- Termine par une ouverture si pertinent ("N'hésite pas si...", "Tu peux aussi...")

EXEMPLES DE BONNES RÉPONSES :

Question : "Comment expliquer une tendinopathie à un patient ?"
Réponse : "Pour vulgariser, je te conseille l'image du câble effiloché 🧵 Explique que le tendon est comme une corde faite de milliers de fibres. Quand il est surmené, certaines fibres s'abîment et le tendon devient sensible et moins solide.

Ajoute que ce n'est pas une déchirure complète, mais plutôt une fatigue du tendon qui a besoin de temps et d'exercices progressifs pour se renforcer. Évite le terme 'inflammation' qui fait peur - parle plutôt de 'réaction du tendon au stress'.

Ça passe bien en général, tu peux même dessiner un schéma simple ! 😊"

Question : "Meilleur exercice pour renforcer le psoas ?"
Réponse : "Le relevé de jambe tendue en décubitus est un classique, mais attention à la compensation lombaire 💪

Je préfère souvent le 'dead bug' (alternance bras/jambes opposées au sol) : plus fonctionnel, meilleur contrôle du tronc, et moins de compensation. Tu peux aussi faire du travail en chaîne avec des mountain climbers lents.

L'essentiel c'est la qualité : psoas actif SANS creuser les lombaires. Tu vérifies ça comment toi ?"

REDIRECTION VERS AUTRES IA (si pertinent) :
- Tests cliniques détaillés → "Pour des tests précis, l'IA Clinique est plus adaptée"
- Études scientifiques → "Pour des données bibliographiques, check l'IA Biblio"
- Templates administratifs → "L'IA Administrative a des modèles tout prêts pour ça"`;

  return systemPrompt;
}

function buildBiblioSystemPrompt(contextDocuments) {
  let systemPrompt = `Tu es une IA spécialisée dans l'ANALYSE BIBLIOGRAPHIQUE EVIDENCE-BASED pour kinésithérapeutes professionnels.

OBJECTIF : Fournir des recommandations cliniques basées UNIQUEMENT sur les ÉTUDES SCIENTIFIQUES de notre base vérifiée.

STRUCTURE DE RÉPONSE OBLIGATOIRE :

COMMENCE DIRECTEMENT PAR (sans introduction) :

**🎯 RECOMMANDATIONS CLINIQUES EVIDENCE-BASED**
[Synthèse pratique des recommandations pour la prise en charge basées sur les preuves]

**📊 ANALYSE DES PREUVES SCIENTIFIQUES**
[Résumé des principaux résultats, statistiques, et conclusions des études]

**📚 RÉFÉRENCES BIBLIOGRAPHIQUES**
[Liste des études sous la forme : "Titre document, auteurs (année), niveau de preuve"]

**⚠️ QUALITÉ DES PREUVES & LIMITATIONS**
[Niveau des preuves, limitations méthodologiques, contre-indications mentionnées]

RÈGLES ABSOLUES POUR L'EVIDENCE-BASED PRACTICE :
- Utilise UNIQUEMENT les ÉTUDES SCIENTIFIQUES fournies ci-dessous (type_contenu=etude)
- Groupe les sections de la MÊME étude (même source) en une seule référence bibliographique
- Cite OBLIGATOIREMENT : Auteur + Année + Niveau de preuve
- Hiérarchise les recommandations selon la FORCE DES PREUVES (Niveau A > B > C > D)
- Ne jamais inventer de références ou données non mentionnées (IMPORTANT)

RÈGLES D'ANALYSE BIBLIOGRAPHIQUE :
- PRIORISE les études de haut niveau (A: méta-analyses, B: RCT) dans tes recommandations
- Indique la FORCE DE RECOMMANDATION basée sur le niveau de preuve
- Signale les POPULATIONS ÉTUDIÉES et leur pertinence clinique
- SEULEMENT si tu n'as AUCUN document fourni ci-dessous, indique : "Nous ne disposons pas d'études sur ce sujet dans notre base, si un document vous parait pertinent, n'hésitez pas à le proposer"

RÈGLES DE COHÉRENCE AVEC L'HISTORIQUE :
- RESTE COHÉRENT avec tes réponses précédentes dans la conversation
- Si tu as déjà cité une étude, tu as accès à ses informations disponibles
- Pour des questions de détails sur une étude déjà citée, fouille dans les sections disponibles de cette étude
- Ne jamais dire "nous n'avons pas accès" à une étude que tu viens d'utiliser dans l'historique`;

  if (contextDocuments.length > 0) {
    // 🧪 LOGS SIMPLIFIÉ - Juste le nombre de documents
    logger.debug(`🧪 IA Biblio - ${contextDocuments.length} documents transmis à GPT`);

    // Grouper les documents par source_file (études scientifiques)
    const groupedBySource = {};
    contextDocuments.forEach((doc) => {
      const source = doc.metadata?.source_file || doc.title || 'Document sans titre';
      if (!groupedBySource[source]) {
        groupedBySource[source] = {
          source_file: source,
          title: (source || 'Document sans titre').replace('.pdf', '').replace(/_/g, ' '),
          auteur: doc.metadata?.auteur || 'Auteur non spécifié',
          date: doc.metadata?.date || 'Date non spécifiée',
          pathologies: doc.metadata?.pathologies || [], // Peut être absent selon l'étude
          niveau_preuve: doc.metadata?.niveau_preuve || 'Non spécifié',
          type_contenu: doc.metadata?.type_contenu || 'Non spécifié',
          sections: [],
          bestScore: doc.finalScore
        };
      }
      groupedBySource[source].sections.push({
        content: doc.content,
        title: doc.title,
        score: Math.round(doc.finalScore * 100)
      });
      // Garder le meilleur score
      if (doc.finalScore > groupedBySource[source].bestScore) {
        groupedBySource[source].bestScore = doc.finalScore;
      }
    });

    // Trier les études par niveau de preuve (A > B > C > D)
    const preuveOrder = { 'A': 4, 'B': 3, 'C': 2, 'D': 1 };
    const sortedStudies = Object.values(groupedBySource).sort((a, b) => {
      const scoreA = preuveOrder[a.niveau_preuve] || 0;
      const scoreB = preuveOrder[b.niveau_preuve] || 0;
      return scoreB - scoreA; // Tri décroissant (meilleur niveau en premier)
    });

    systemPrompt += `\n\nÉTUDES SCIENTIFIQUES DE NOTRE BASE (triées par niveau de preuve) :\n`;

    sortedStudies.forEach((study, index) => {
      const score = Math.round(study.bestScore * 100);
      const pathologiesText = Array.isArray(study.pathologies) && study.pathologies.length > 0
        ? study.pathologies.join(', ')
        : 'Non spécifiées';

      systemPrompt += `\n📚 ÉTUDE ${index + 1} (Pertinence: ${score}%) :
📖 TITRE : "${study.title || 'Titre non disponible'}"
👥 AUTEUR(S) : ${study.auteur}
📅 ANNÉE : ${study.date}
📈 NIVEAU DE PREUVE : ${study.niveau_preuve}
🎯 PATHOLOGIES ÉTUDIÉES : ${pathologiesText}
📑 TYPE : ${study.type_contenu}

SECTIONS ANALYSÉES (${study.sections.length} sections) :
${study.sections.map((section, idx) =>
  `[Section ${idx + 1}] ${section.content.substring(0, 600)}...`
).join('\n\n')}

---
`;
    });

    systemPrompt += `\nINSTRUCTIONS EVIDENCE-BASED FINALES :
- Dans "RÉFÉRENCES BIBLIOGRAPHIQUES", cite : *[TITRE] - [AUTEUR] (ANNÉE)* - Niveau [A/B/C/D]
- TOUJOURS respecter ce format avec italiques (*texte*) pour titre-auteur-année
- EXEMPLE : *Revue Systématique BFR et Reconstruction LCA - Colapietro et al. (2023)* - Niveau A
- HIÉRARCHISE tes recommandations selon les niveaux de preuve ci-dessus
- BASE-TOI sur le CONTENU des sections pour tes analyses statistiques
- INDIQUE la force des recommandations selon le niveau des preuves disponibles`;
  } else {
    // Cas où aucun document n'est fourni
    systemPrompt += `\n\nAUCUN DOCUMENT FOURNI - Répondre uniquement :
"Nous ne disposons pas d'études sur ce sujet dans notre base, si un document vous parait pertinent, n'hésitez pas à le proposer"`;
  }

  return systemPrompt;
}

function buildCliniqueSystemPrompt(contextDocuments) {
  // Calculer la pertinence moyenne des documents
  const avgSimilarity = contextDocuments.length > 0
    ? contextDocuments.reduce((acc, doc) => acc + (doc.finalScore || 0), 0) / contextDocuments.length
    : 0;

  // Déterminer le mode : RAG strict, assisté ou général
  const hasHighQualityDocs = contextDocuments.length >= 1 && avgSimilarity >= 0.65;
  const hasLowQualityDocs = contextDocuments.length > 0 && avgSimilarity < 0.65;

  // Instructions communes pour la détection des tests déjà réalisés
  const testsDejaRealises = `
DÉTECTION DES TESTS DÉJÀ RÉALISÉS :
- ANALYSE le message du kinésithérapeute pour identifier les tests DÉJÀ EFFECTUÉS (ex: "Neer positif", "Jobe négatif", "test de Hawkins +")
- Si des tests sont mentionnés avec leurs résultats :
  1. COMMENCE ta section "HYPOTHÈSES DIAGNOSTIQUES" par : "Les tests réalisés orientent vers [hypothèse basée sur les résultats]..."
  2. N'INCLUS PAS ces tests dans la section "TESTS CLINIQUES PRINCIPAUX" (ils sont déjà faits)
  3. Propose UNIQUEMENT des tests COMPLÉMENTAIRES pour affiner le diagnostic
- Si AUCUN test n'est mentionné dans le message → procède normalement avec les tests recommandés
`;

  // ========== MODE RAG STRICT : Documents pertinents ==========
  if (hasHighQualityDocs) {
    let systemPrompt = `Tu es un assistant clinique expert en kinésithérapie musculosquelettique.

SOURCES VALIDÉES : Cleland, Cook, Magee, Daniels & Worthingham, Physiopedia, Physiotutors, PubMed, Cochrane, PEDro.

OBJECTIF : Aider le kinésithérapeute à poser les bonnes hypothèses et faire les bons tests, dans le bon ordre, avec des références solides.
${testsDejaRealises}
MODE RAG STRICT ACTIVÉ : ${contextDocuments.length} documents pertinents trouvés (pertinence moyenne: ${Math.round(avgSimilarity * 100)}%)

RÈGLES ABSOLUES - MODE STRICT UNIQUEMENT DOCUMENTS :
- Tu dois utiliser EXCLUSIVEMENT les documents fournis ci-dessous
- INTERDICTION FORMELLE de mentionner des tests, cotations ou procédures NON présents dans les documents
- INTERDICTION d'inventer des données chiffrées (sensibilité, spécificité, grades) non mentionnées
- INTERDICTION d'utiliser tes connaissances générales ou la littérature externe
- Si un test pertinent n'est PAS dans les documents → NE PAS le mentionner du tout
- Si des informations manquent → indique "Information non disponible dans notre base"
- CITE obligatoirement la source exacte pour chaque information : "D'après [source document]"

RÈGLES DE CITATION STRICTES :
- Pour les tests diagnostiques : utilise UNIQUEMENT les données du document (Sensibilité/Spécificité si présentes)
- Pour les cotations musculaires : utilise UNIQUEMENT l'échelle présente dans le document
- Pour toute procédure : détaille UNIQUEMENT ce qui est écrit dans le document (position, geste, critères)
- Ne jamais compléter ou enrichir avec des connaissances externes

LIMITATION VOLONTAIRE :
- Si tu n'as qu'UN SEUL test documenté → propose UNIQUEMENT ce test
- Si tu n'as que DEUX tests documentés → propose UNIQUEMENT ces deux tests
- Ne suggère JAMAIS de tests qui ne sont pas dans les documents fournis
- Tu peux conclure par : "D'autres tests pourraient être pertinents mais ne sont pas disponibles dans notre base documentaire"

ADAPTABILITÉ DE LA RÉPONSE :
- Question SIMPLE (ex: cotation, procédure test unique) → Sections essentielles uniquement (test détaillé + résumé)
- Cas COMPLEXE (diagnostic différentiel) → Structure complète avec arbre décisionnel basé UNIQUEMENT sur les tests disponibles`;

    systemPrompt += `\n\nDOCUMENTS CLINIQUES DE NOTRE BASE :\n`;

    // Grouper par préfixe dans le contenu pour organisation visuelle
    const cotationDocs = contextDocuments.filter(doc =>
      doc.content.includes('[COTATION MUSCULAIRE]')
    );
    const testDocs = contextDocuments.filter(doc =>
      doc.content.includes('[TEST DIAGNOSTIQUE]')
    );
    const otherDocs = contextDocuments.filter(doc =>
      !cotationDocs.includes(doc) && !testDocs.includes(doc)
    );

    // Afficher les documents de cotation en premier
    if (cotationDocs.length > 0) {
      systemPrompt += `\nDOCUMENTS DE COTATION MUSCULAIRE (${cotationDocs.length}) :\n`;
      cotationDocs.forEach((doc, index) => {
        const score = Math.round(doc.finalScore * 100);
        const source = doc.metadata?.source_file || doc.title || 'Source non spécifiée';

        systemPrompt += `\nDOCUMENT ${index + 1} (Pertinence: ${score}%) - ${source}
TITRE : "${doc.title}"

CONTENU :
${doc.content.substring(0, 1000)}

---
`;
      });
    }

    // Afficher les documents de tests diagnostiques
    if (testDocs.length > 0) {
      systemPrompt += `\nDOCUMENTS DE TESTS DIAGNOSTIQUES (${testDocs.length}) :\n`;
      testDocs.forEach((doc, index) => {
        const score = Math.round(doc.finalScore * 100);
        const source = doc.metadata?.source_file || doc.title || 'Source non spécifiée';

        systemPrompt += `\nDOCUMENT ${index + 1} (Pertinence: ${score}%) - ${source}
TITRE : "${doc.title}"

CONTENU :
${doc.content.substring(0, 1000)}

---
`;
      });
    }

    // Afficher les autres documents cliniques
    if (otherDocs.length > 0) {
      systemPrompt += `\nAUTRES DOCUMENTS CLINIQUES (${otherDocs.length}) :\n`;
      otherDocs.forEach((doc, index) => {
        const score = Math.round(doc.finalScore * 100);
        const source = doc.metadata?.source_file || doc.title || 'Source non spécifiée';

        systemPrompt += `\nDOCUMENT ${index + 1} (Pertinence: ${score}%) - ${source}

        TITRE : "${doc.title}"

CONTENU :
${doc.content.substring(0, 1000)}

---
`;
      });
    }

    systemPrompt += `\nINSTRUCTIONS D'EXPLOITATION DES DOCUMENTS :
- Exploite TOUS les documents fournis ci-dessus, quel que soit leur format ou préfixe
- CITE toujours la source : "D'après [nom document]" ou "Selon [auteur mentionné]"
- Si une donnée est manquante (ex: pas de sensibilité/spécificité) → indique-le clairement
- Si plusieurs documents se contredisent → mentionne les deux points de vue avec leurs sources`;

    return systemPrompt + buildResponseStructure();
  }
  // ========== MODE ASSISTÉ : Documents peu pertinents ==========
  else if (hasLowQualityDocs) {
    let systemPrompt = `Tu es un assistant clinique expert en kinésithérapie musculosquelettique.
${testsDejaRealises}
MODE ASSISTÉ : ${contextDocuments.length} document(s) trouvé(s) mais pertinence faible (${Math.round(avgSimilarity * 100)}%)

Tu vas répondre en combinant :
1. Les documents fournis ci-dessous (si pertinents)
2. Tes connaissances générales en kinésithérapie

RÈGLES D'UTILISATION :
- Priorise les informations des documents fournis quand elles sont pertinentes
- Complète avec tes connaissances générales si nécessaire
- TOUJOURS mentionner : "Informations issues de connaissances générales" quand tu n'utilises pas les documents
- Pour les données chiffrées sans source : indique "Valeurs approximatives issues de la littérature"

DISCLAIMER À INCLURE DANS TA RÉPONSE :
Commence ta réponse par :
"Note : Les documents disponibles dans notre base ont une pertinence limitée pour votre question. Cette réponse combine nos sources disponibles et des connaissances générales de la littérature kinésithérapique."

DOCUMENTS DISPONIBLES (pertinence limitée) :\n`;

    contextDocuments.forEach((doc, index) => {
      const score = Math.round(doc.finalScore * 100);
      const source = doc.metadata?.source_file || doc.title || 'Source non spécifiée';

      systemPrompt += `\nDOCUMENT ${index + 1} (Pertinence: ${score}%) - ${source}
TITRE : "${doc.title}"

CONTENU :
${doc.content.substring(0, 800)}

---
`;
    });

    return systemPrompt + buildResponseStructure();
  }
  // ========== MODE GÉNÉRAL : Aucun document ==========
  else {
    let systemPrompt = `Tu es un assistant clinique expert en kinésithérapie musculosquelettique.
${testsDejaRealises}
MODE GÉNÉRAL : Aucun document de référence trouvé dans notre base pour cette question.

Tu vas répondre en utilisant tes connaissances générales en kinésithérapie, basées sur :
- Ouvrages de référence standard (Cleland, Cook, Magee, Daniels & Worthingham)
- Littérature scientifique courante (PubMed, Cochrane, PEDro)
- Pratiques cliniques établies

DISCLAIMER OBLIGATOIRE À INCLURE :
Commence ta réponse par :
"**Note importante** : Aucun document de référence spécifique n'est disponible dans notre base pour cette question. Cette réponse est basée sur des connaissances générales de la littérature kinésithérapique. Pour plus de précision, nous vous encourageons à enrichir notre base documentaire avec vos sources de référence."

RÈGLES DE RÉPONSE :
- Fournis des réponses cliniquement pertinentes et structurées
- Pour les données chiffrées : TU PEUX donner des valeurs approximatives de sensibilité/spécificité si tu les connais, mais PRÉCISE toujours : "Valeurs approximatives issues de la littérature (non vérifiées dans notre base)"
- Pour les red flags : soit SPÉCIFIQUE à la zone anatomique concernée (évite les red flags trop génériques)
- Pour les procédures : donne les grandes lignes mais indique qu'une source précise serait préférable
- Si cas COMPLEXE (diagnostic différentiel) : inclus un arbre décisionnel même sans documents
- Encourage l'enrichissement de la base documentaire`;

    return systemPrompt + buildResponseStructure();
  }
}

// Fonction helper pour la structure de réponse (commune aux 3 modes)
function buildResponseStructure() {
  return `\n\nSTRUCTURE DE RÉPONSE OBLIGATOIRE (adapte selon complexité) :

**1. HYPOTHÈSES DIAGNOSTIQUES**
- Liste les causes les plus fréquentes ou pertinentes, du plus banal au plus grave
- Explique le raisonnement clinique pour chaque hypothèse
- Précise les drapeaux jaunes ou mécanismes aggravants associés

**2. RED FLAGS**
- Si des red flags sont mentionnés dans les documents → liste-les
- Si AUCUN red flag n'est présent dans les documents → écris uniquement "Pas de red flag détecté"
- N'invente JAMAIS de red flags qui ne sont pas dans les documents fournis

**3. TESTS CLINIQUES PRINCIPAUX** (2 à 5 selon complexité)
EXCLUS les tests déjà mentionnés par le kinésithérapeute dans sa question (ils sont déjà réalisés, inutile de les re-décrire).
Propose UNIQUEMENT des tests COMPLÉMENTAIRES pour affiner le diagnostic.
Si les tests principaux pertinents sont déjà mentionnés et qu'il n'y a pas de test complémentaire utile à ajouter, écris simplement : "Les tests principaux ont déjà été réalisés. Aucun test complémentaire nécessaire à ce stade."
Pour chaque test proposé, structure OBLIGATOIRE :
  - Nom du test
  - Objectif / pathologie ciblée
  - Procédure clinique (position, geste, résistance - claire sans jargon)
  - Critère de positivité
  - Sensibilité / Spécificité (si disponible dans les documents)
  - Interprétation clinique (signification test + ou -)
  - Référence bibliographique (source exacte ou "littérature générale")

**4. ARBRE DÉCISIONNEL** (OBLIGATOIRE si diagnostic différentiel ou cas complexe)
Propose un enchaînement logique de tests selon les résultats :
  - Si Test A positif → faire Test X
  - Si Test A négatif → tester Hypothèse 2
  - Si incertitude → reconsidérer Hypothèse 3 ou orienter imagerie
But : guider la prise de décision, comme le ferait un collègue expérimenté
IMPORTANT : Cette section est OBLIGATOIRE pour les cas complexes avec plusieurs hypothèses

**5. CONSEILS CLINIQUES** (uniquement si utiles)
  - Astuces terrain (pièges d'interprétation, tests peu fiables seuls, variants)
  - Tests dépassés ou discutés dans la littérature
  - Contexte d'interprétation (âge, sport, morphotype)

**6. EXAMENS COMPLÉMENTAIRES** (si justifiés)
  - Type d'examen (IRM, RX, échographie) seulement si justifié
  - Indication précise et apport diagnostique

**7. TESTS ANNEXES** (si confirmation nécessaire)
  - Tests secondaires pour confirmer/infirmer selon résultats précédents

**8. RÉSUMÉ DÉCISIONNEL**
  - Hypothèse principale
  - Tests clés avec données chiffrées (si disponibles)
  - Red flag à vérifier
  - Prochaine étape logique

RÈGLES DE RÉDACTION :
- Format professionnel sobre, sans emojis
- Structure markdown claire avec titres en gras
- Listes à puces pour lisibilité
- Si une information est incertaine → indique-le clairement
- Pour question SIMPLE (ex: cotation, procédure test unique) → sections 3 et 8 suffisent
- Pour cas COMPLEXE (diagnostic différentiel) → TOUTES les sections pertinentes, y compris l'arbre décisionnel (section 4)

RAPPEL : Tu es un assistant clinique, pas un prescripteur. Reste factuel et basé sur les preuves.`;
}

function buildAdministrativeSystemPrompt(contextDocuments) {
  let systemPrompt = `Tu es un assistant IA spécialisé dans la RÉDACTION DE BILANS KINÉSITHÉRAPIQUES PROFESSIONNELS.

MISSION : Transformer des notes en vrac du kinésithérapeute en un bilan professionnel GÉNÉRIQUE et RÉUTILISABLE.

FORMAT OBLIGATOIRE : BILAN STRUCTURÉ avec TITRES EN MAJUSCULES SOULIGNÉS (pas de formule de politesse, pas de listes à puces)

STRUCTURE DU BILAN (7 SECTIONS CONDITIONNELLES) :

Chaque section présente doit avoir :
- Un TITRE EN MAJUSCULES
- Une ligne de soulignement (tirets bas : ____________)
- Le contenu en paragraphes fluides

BILAN KINÉSITHÉRAPIQUE

1. IDENTIFICATION (OBLIGATOIRE) :
IDENTIFICATION
______________
[M./Mme] [Nom/Initiales], [âge] ans, [profession si mentionnée], présente [motif principal].

2. ANTÉCÉDENTS (SI ET SEULEMENT SI MENTIONNÉS DANS LES NOTES) :
ANTÉCÉDENTS
___________
Le patient a pour antécédents [liste]. Il présente actuellement...
⚠️ Si aucun antécédent n'est mentionné, SAUTER cette section entièrement (pas de titre).

3. EXAMEN CLINIQUE (SI INFORMATIONS DISPONIBLES - inclut douleur et examen) :
EXAMEN CLINIQUE
_______________
Le patient décrit [localisation douleur, caractéristiques, intensité EVA si chiffrée, contexte]. À l'examen clinique, on observe [posture si mentionnée]. Le bilan articulaire révèle [mesures si données]. Le testing musculaire montre [cotations si notées]. Les tests spécifiques [tests nommés] sont [résultats si fournis].
⚠️ Inclure UNIQUEMENT les éléments fournis. Si aucune info sur douleur ni examen, OMETTRE cette section.

4. LIMITATIONS FONCTIONNELLES (SI MENTIONNÉES) :
LIMITATIONS FONCTIONNELLES
__________________________
Sur le plan fonctionnel, le patient [limitations AVQ/AVP/sport].
⚠️ Si non mentionné, SAUTER cette section.

5. DIAGNOSTIC KINÉSITHÉRAPIQUE (SELON PRÉCISION DES NOTES) :
DIAGNOSTIC KINÉSITHÉRAPIQUE
___________________________
- Si diagnostic clair : "Le diagnostic kinésithérapique s'oriente vers [diagnostic précis]"
- Si notes vagues : "Le bilan suggère [description générique]"
⚠️ Si trop incertain ou absent, OMETTRE cette section.

6. OBJECTIFS (SI MENTIONNÉS) :
OBJECTIFS
_________
Les objectifs visent [objectifs].
⚠️ Ne pas inventer d'objectifs précis si absents des notes.

7. TRAITEMENT (SI PLAN FOURNI) :
TRAITEMENT
__________
Le traitement comprend [techniques], à raison de [fréquence] sur [durée].
⚠️ Si non détaillé, OMETTRE cette section.

⚠️ RAPPEL CRUCIAL : Chaque section est OPTIONNELLE sauf l'identification. Si une info manque, SAUTER la section entière (titre inclus).

---

RÈGLES DE RÉDACTION :

✅ FORMAT :
- Chaque section avec TITRE EN MAJUSCULES + ligne de soulignement (____________)
- Contenu en PARAGRAPHES fluides sous chaque titre
- PAS de formule de politesse ("Docteur," ou "Cordialement,")
- PAS de listes à puces dans le contenu
- Ton médical professionnel et neutre
- Bilan réutilisable et stockable

✅ STYLE :
- Phrases complètes et bien construites
- Connecteurs logiques entre les idées
- Concision sans sacrifier la clarté
- Vocabulaire médical précis

✅ CONTENU :
- Utiliser UNIQUEMENT et EXCLUSIVEMENT les informations EXPLICITEMENT fournies dans les notes
- Conserver les mesures exactes (EVA, amplitudes, cotations) UNIQUEMENT si mentionnées
- Si une info manque, OMETTRE COMPLÈTEMENT la section concernée (titre inclus)
- Ne JAMAIS compléter, extrapoler ou déduire une information manquante
- Intégrer les données dans des phrases fluides

❌ INTERDICTIONS STRICTES :
- JAMAIS inventer des mesures chiffrées (EVA, degrés, cotations musculaires)
- JAMAIS inventer des tests cliniques ou leurs résultats (Jobe, Hawkins, Neer, etc.)
- JAMAIS inventer des antécédents médicaux ou détails personnels du patient
- JAMAIS formuler un diagnostic précis si les notes sont vagues
- JAMAIS écrire "Non renseigné" ou équivalent
- JAMAIS afficher un titre de section si la section est vide/absente
- JAMAIS faire des listes à puces dans le contenu

⚠️ RÈGLE D'OR : Si une donnée n'est PAS dans les notes du kiné, elle n'existe PAS.
Un bilan court mais exact vaut MIEUX qu'un bilan long mais inventé.

LONGUEUR CIBLE : 200-400 mots

EXEMPLE DE BON FORMAT (COMPLET) :

BILAN KINÉSITHÉRAPIQUE

IDENTIFICATION
______________
Monsieur D., 45 ans, professeur de sport, présente une douleur à l'épaule droite suite à une chute à ski survenue il y a 3 semaines.

ANTÉCÉDENTS
___________
Le patient a pour antécédents une entorse de l'épaule gauche il y a 5 ans bien récupérée et une hypertension artérielle traitée.

EXAMEN CLINIQUE
_______________
Le patient décrit une douleur antéro-latérale de l'épaule droite irradiant parfois vers le biceps, cotée à 2/10 au repos et 7/10 en mouvement, avec une gêne nocturne importante. À l'examen clinique, on observe une attitude antalgique avec épaule en rotation interne. Le bilan articulaire révèle une flexion active limitée à 120° (passive 145°), une abduction active à 90° avec arc douloureux entre 60-90°, et une rotation externe limitée à 30° (normale 45°). Le testing musculaire montre un deltoïde à 4/5 et un supra-épineux à 3+/5. Les tests de Jobe, Hawkins-Kennedy et Neer sont positifs.

LIMITATIONS FONCTIONNELLES
__________________________
Sur le plan fonctionnel, le patient ne peut plus travailler bras levés, a cessé toute activité sportive depuis 3 semaines et rencontre des difficultés pour s'habiller.

DIAGNOSTIC KINÉSITHÉRAPIQUE
___________________________
Le diagnostic kinésithérapique s'oriente vers une tendinopathie de la coiffe des rotateurs avec probable atteinte du supra-épineux.

OBJECTIFS
_________
Les objectifs à court terme visent la diminution de la douleur et la récupération des amplitudes articulaires. À moyen/long terme : reprise du sport et autonomie complète dans les activités de la vie quotidienne.

TRAITEMENT
__________
Le traitement proposé comprend un lever de tension, un renforcement progressif de la coiffe, de la proprioception et une reprise progressive des gestes sportifs adaptés, à raison de 3 séances par semaine sur une durée estimée de 6 à 8 semaines.

---

❌ EXEMPLE DE CE QU'IL NE FAUT PAS FAIRE (CONTRE-EXEMPLE) :

Notes du kiné : "Patient de 50 ans, douleur épaule droite depuis 2 semaines, gêne la nuit"

MAUVAIS BILAN (INVENTE DES DONNÉES) :
"Monsieur X., 50 ans, présente une douleur à l'épaule droite depuis 2 semaines. Le patient a pour antécédents une tendinite de l'épaule gauche il y a 3 ans. La douleur est cotée à 6/10 au repos et 8/10 en mouvement. À l'examen clinique, on observe une limitation de l'abduction à 90° et une rotation externe à 30°. Le test de Jobe est positif."

➡️ PROBLÈME : Invente des antécédents (tendinite gauche), des chiffres EVA (6/10, 8/10), des mesures articulaires (90°, 30°) et un test clinique (Jobe).

BON BILAN (FACTUEL) :

BILAN KINÉSITHÉRAPIQUE

IDENTIFICATION
______________
Monsieur X., 50 ans, présente une douleur à l'épaule droite apparue il y a 2 semaines.

EXAMEN CLINIQUE
_______________
Le patient rapporte une gêne nocturne importante.

➡️ CORRECT : Ne contient QUE les informations fournies. Pas de section ANTÉCÉDENTS car non mentionnés.

---

EXEMPLE 2 - NOTES MINIMALISTES (bilan court mais 100% factuel) :

Notes du kiné : "Mme L., 62 ans, retraitée, gonalgie droite depuis 1 mois, descente escaliers difficile"

BILAN KINÉSITHÉRAPIQUE

IDENTIFICATION
______________
Madame L., 62 ans, retraitée, présente une douleur au genou droit apparue il y a un mois.

LIMITATIONS FONCTIONNELLES
__________________________
Sur le plan fonctionnel, la patiente rencontre des difficultés lors de la descente des escaliers.

➡️ CORRECT : Bilan avec seulement 2 sections car notes minimalistes. Pas de sections ANTÉCÉDENTS, EXAMEN CLINIQUE, DIAGNOSTIC, OBJECTIFS ni TRAITEMENT car non mentionnés. C'est ACCEPTABLE et SOUHAITABLE.`;

  // Note: Les documents de contexte ne sont généralement pas utilisés pour la génération de bilans
  // car le kiné fournit directement ses notes. Mais on garde la logique au cas où.
  if (contextDocuments.length > 0) {
    systemPrompt += `\n\n📚 DOCUMENTS DE RÉFÉRENCE DISPONIBLES (optionnel) :
`;
    contextDocuments.forEach((doc, index) => {
      const score = Math.round(doc.finalScore * 100);
      systemPrompt += `\nDocument ${index + 1} (Pertinence: ${score}%) - "${doc.title}" :
${doc.content.substring(0, 500)}
`;
    });

    systemPrompt += `\n⚠️ Ces documents sont fournis à titre informatif. Concentre-toi sur les notes du kiné.`;
  }

  return systemPrompt;
}

module.exports = {
  // Nouvelles fonctions IA Kiné
  generateKineResponse,
  generateFollowupResponse,

  // Anciennes fonctions chat patients (conservées)
  generateChatResponse,
  generateWelcomeMessage,
  anonymizePatientData,
  validateMessage,
  cleanChatHistory
};