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
// options.dateFin : si fourni, génère des URLs signées v2 (longue durée) avec placeholders courts pour GPT
const anonymizePatientData = async (patient, programmes, options = {}) => {
  const { dateFin } = options;
  const gifUrlMap = {};
  let gifIndex = 0;

  // Traiter les programmes avec génération d'URLs pour les GIFs
  const programmesWithSignedUrls = await Promise.all(
    programmes.map(async (prog) => {
      // Traiter les exercices de ce programme
      const exercicesWithUrls = await Promise.all(
        (prog.exercices || []).map(async (ex) => {
          const gifPath = ex.exerciceModele?.gifPath;
          let gifUrl = null;
          if (gifPath) {
            if (dateFin) {
              // Mode placeholder : URL signée v2 (expire à dateFin), GPT utilise un placeholder court
              const remaining = new Date(dateFin).getTime() - Date.now();
              const expirationMs = remaining > 0 ? remaining : 2 * 60 * 60 * 1000;
              const signedUrl = await gcsStorageService.generateSignedUrl(gifPath, expirationMs, 'v2');

              if (signedUrl) {
                const placeholder = `https://gif/${gifIndex}`;
                gifUrlMap[placeholder] = signedUrl;
                gifUrl = placeholder;
                gifIndex++;
              }
            } else {
              // Mode direct : URL signée v4 temporaire (2h) — comportement par défaut
              gifUrl = await gcsStorageService.generateSignedUrl(gifPath, 2 * 60 * 60 * 1000);
            }
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
    programmes: programmesWithSignedUrls,
    gifUrlMap
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
   ${ex.gifUrl ? `Démonstration : ${ex.gifUrl}` : ''}
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
- GIFS: Quand le patient pose une question sur un exercice, TOUJOURS inclure le GIF de démonstration (si disponible) en utilisant la syntaxe markdown ![Démonstration](url) avec l'URL fournie dans "Démonstration"

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
// options.dateFin : date de fin du programme pour générer des URLs signées v2 longue durée
const generateChatResponse = async (patientData, programmes, userMessage, chatHistory = [], options = {}) => {
  try {
    // Validation des données d'entrée
    if (!patientData || !programmes || !userMessage) {
      throw new Error('Données manquantes pour générer la réponse');
    }

    // Anonymiser les données (async pour génération URLs signées GCS)
    const anonymizedData = await anonymizePatientData(patientData, programmes, { dateFin: options.dateFin });

    // Générer le prompt système
    const systemPrompt = generateSystemPrompt(anonymizedData);

    // Limiter l'historique et nettoyer les URLs signées GCS (évite que GPT les recopie)
    const limitedHistory = chatHistory.slice(-10);

    // Préparer les messages pour OpenAI
    const messages = [
      { role: 'system', content: systemPrompt },
      ...limitedHistory.map(msg => ({
        role: msg.role === 'patient' ? 'user' : 'assistant',
        content: msg.content.replace(
          /!\[[^\]]*\]\(https:\/\/storage\.googleapis\.com\/[^)]+\)\n?/g,
          ''
        )
      })),
      { role: 'user', content: userMessage }
    ];

    // Appel à OpenAI avec GPT-4o-mini
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      max_tokens: 1200,
      temperature: 0.7,
      presence_penalty: 0.2,
      frequency_penalty: 0.1,
      top_p: 0.9
    });

    let message = response.choices[0].message.content.trim();

    // Remplacer les placeholders GIF par les vraies URLs signées
    if (anonymizedData.gifUrlMap) {
      for (const [placeholder, url] of Object.entries(anonymizedData.gifUrlMap)) {
        message = message.replaceAll(placeholder, url);
      }
      // Fix GPT: transformer [Démonstration](url) en ![Démonstration](url) si le ! manque
      message = message.replace(/(?<!!)\[([^\]]*)\]\((https:\/\/storage\.googleapis\.com\/[^)]+)\)/g, '![$1]($2)');
    }

    return {
      success: true,
      message,
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
// options.dateFin : date de fin du programme pour générer des URLs signées v2 longue durée
const generateWelcomeMessage = async (patientData, programmes, options = {}) => {
  try {
    // Validation des données
    if (!patientData || !programmes) {
      return {
        success: false,
        message: "👋 Bonjour ! Je suis votre assistant kinésithérapeute virtuel. Je suis là pour vous accompagner dans votre programme de rééducation. Comment vous sentez-vous aujourd'hui ?"
      };
    }

    // IMPORTANT: Anonymisation complète - aucune donnée d'identité transmise à OpenAI
    const anonymizedData = await anonymizePatientData(patientData, programmes, { dateFin: options.dateFin });
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
- UTILISE LES URLS DES GIFS fournis dans les données des exercices (champ Démonstration)
- SI un exercice a un GIF (Démonstration : url) → affiche-le IMMÉDIATEMENT après cet exercice avec la syntaxe markdown ![Démonstration](url)
- Chaque GIF doit être placé JUSTE APRÈS son exercice correspondant (pas groupés à la fin)
- Affiche 1 à 3 GIFs maximum (ceux des premiers exercices qui en ont)
- SI aucun exercice n'a de GIF → n'affiche PAS de GIF du tout (ne pas utiliser de GIF générique)`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: welcomePrompt }
      ],
      max_tokens: 800, // GPT génère des pseudo-URLs courtes (https://gif/0) remplacées après
      temperature: 0.5
    });

    let message = response.choices[0].message.content.trim();

    // Remplacer les placeholders GIF par les vraies URLs signées
    if (anonymizedData.gifUrlMap) {
      for (const [placeholder, url] of Object.entries(anonymizedData.gifUrlMap)) {
        message = message.replaceAll(placeholder, url);
      }
      // Fix GPT: transformer [Démonstration](url) en ![Démonstration](url) si le ! manque
      message = message.replace(/(?<!!)\[([^\]]*)\]\((https:\/\/storage\.googleapis\.com\/[^)]+)\)/g, '![$1]($2)');
    }

    return {
      success: true,
      message,
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

// ========== QUERY ROUTER — DÉTECTION D'INTENTION ==========

const ROUTER_TYPE_MAP = { 'BASIC': 'basique', 'BIBLIO': 'biblio', 'CLINIC': 'clinique' };
const ROUTER_LABEL_MAP = { 'basique': 'IA Conversationnelle', 'biblio': 'IA Bibliographique', 'clinique': 'IA Clinique' };

/**
 * Route la requête kiné via GPT-4o-mini (température 0, ~50 tokens)
 * Retourne { type: "BASIC"|"BIBLIO"|"CLINIC", rag: true|false }
 */
const routeQuery = async (message, conversationHistory = []) => {
  try {
    const recentHistory = conversationHistory.slice(-10).map(msg =>
      `${msg.role}: ${msg.content.substring(0, 200)}`
    ).join('\n');

    const routerPrompt = `Tu es un routeur d'intention pour une application de kinésithérapie. Analyse le message et le contexte pour déterminer le type de réponse et si une recherche documentaire est nécessaire.

TYPES :
- BASIC : Question conversationnelle, conseil pratique, explication pour un patient, organisation cabinet, salutation, remerciement
- BIBLIO : Recherche bibliographique, études scientifiques, preuves, "que dit la littérature", "quels traitements optimaux", "quel est l'intérêt de"
- CLINIC : Cas clinique complexe, diagnostic différentiel, tests diagnostiques spécifiques, cotations musculaires, "test de Lachman", "diagnostic épaule"

RAG (recherche documentaire) :
- true : Le kiné cherche une information spécifique qui nécessite des sources (tests, mesures, cotations, protocoles précis, données chiffrées)
- false : Question conversationnelle, conseil général, explication vulgarisée, salutation, remerciement, organisation

Exemples :
- "Bonjour" → BASIC, rag: false
- "Comment expliquer une tendinopathie à un patient ?" → BASIC, rag: false
- "C'est quoi le test de Lachman ?" → BASIC, rag: true
- "Meilleur exercice pour renforcer le psoas ?" → BASIC, rag: false
- "Quels traitements optimaux pour la lombalgie ?" → BIBLIO, rag: true
- "Patient 45 ans douleur épaule après tennis" → CLINIC, rag: true
- "Merci pour l'info" → BASIC, rag: false

Historique récent :
${recentHistory || 'Aucun'}

Message : "${message}"

Réponds UNIQUEMENT en JSON : {"type":"BASIC"|"BIBLIO"|"CLINIC","rag":true|false}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: routerPrompt }],
      max_tokens: 50,
      temperature: 0,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content);
    const routedType = ROUTER_TYPE_MAP[result.type] || 'basique';
    const rag = result.rag !== false;

    logger.debug(`🔀 Query Router: type=${result.type} (${routedType}), rag=${rag}`);

    return { type: routedType, rag };
  } catch (error) {
    logger.error('❌ Erreur Query Router:', error.message);
    return { type: 'basique', rag: true };
  }
};

/**
 * Génère la directive de redirection si mismatch entre page et router
 */
const getRedirectDirective = (currentPage, routedType) => {
  const targetLabel = ROUTER_LABEL_MAP[routedType];

  if (currentPage === 'basique') {
    return `Tu es un assistant kiné conversationnel. Donne un aperçu très court du sujet (2-3 phrases max, sans inventer de chiffres ni d'études), puis termine en suggérant d'utiliser ${targetLabel} pour une réponse complète et sourcée. Sans emoji. Maximum 50 mots.`;
  }
  if (currentPage === 'biblio') {
    return `Tu es un assistant kiné bibliographique. Dis en une phrase que tu n'as pas d'études disponibles pour cette demande, puis suggère d'utiliser ${targetLabel} pour une réponse adaptée. Sans emoji. Maximum 30 mots.`;
  }
  if (currentPage === 'clinique') {
    return `Tu es un assistant kiné clinique. Dis en une phrase qu'il n'y a pas de raisonnement clinique disponible pour cette demande, puis suggère d'utiliser ${targetLabel} pour une réponse adaptée. Sans emoji. Maximum 30 mots.`;
  }
  return '';
};

// ========== NOUVELLE FONCTION PRINCIPALE POUR LES IA KINÉ ==========

/**
 * Prépare la requête IA : query router, RAG, prompt, messages
 * Réutilisé par generateKineResponse (bloquant) et generateKineResponseStream (SSE)
 */
const prepareKineRequest = async (type, message, conversationHistory = [], kineId) => {
  logger.debug(`🚀 IA ${type} pour kiné ID: ${sanitizeUID(kineId)}`);

  if (!message?.trim()) {
    throw new Error('Message requis');
  }

  // 1. Query Router — détection d'intention (skip pour admin)
  let routerResult = { type, rag: true };
  let redirectDirective = '';

  if (type !== 'admin') {
    routerResult = await routeQuery(message, conversationHistory);
    const isMismatch = routerResult.type !== type;

    if (isMismatch) {
      redirectDirective = getRedirectDirective(type, routerResult.type);
      logger.debug(`🔀 Mismatch: page=${type}, router=${routerResult.type} → redirection suggérée, RAG skippé`);
    } else if (!routerResult.rag) {
      logger.debug(`🔀 Match: page=${type}, rag=false → RAG skippé`);
    } else {
      logger.debug(`🔀 Match: page=${type}, rag=true → RAG activé`);
    }
  }

  const shouldDoRAG = type !== 'admin' && routerResult.type === type && routerResult.rag;

  // 2. Recherche documentaire (uniquement si RAG activé)
  let allDocuments = [];
  let selectedSources = [];
  let metadata = { totalFound: 0, averageScore: 0, categoriesFound: [] };
  let limitedDocuments = [];

  if (shouldDoRAG) {
    const searchResult = await knowledgeService.searchDocuments(message, {
      filterCategory: null,
      allowLowerThreshold: true,
      iaType: type
    });

    allDocuments = searchResult.allDocuments;
    selectedSources = searchResult.selectedSources;
    metadata = searchResult.metadata;

    const docLimits = {
      'basique': 5,
      'biblio': 6,
      'clinique': 6,
    };

    const maxDocs = docLimits[type] || 6;
    limitedDocuments = allDocuments.slice(0, maxDocs);
  }

  // 3. Construction du prompt système selon le type + directive de redirection si mismatch
  let systemPrompt;
  if (redirectDirective) {
    systemPrompt = redirectDirective.trim();
  } else {
    systemPrompt = getSystemPromptByType(type, limitedDocuments, shouldDoRAG);
  }

  // 🧪 LOGS DE DEBUG POUR VÉRIFIER LA TRANSMISSION À GPT
  logger.debug(`📤 ═══ IA ${type.toUpperCase()} - TRANSMISSION AU LLM ═══`);
  logger.debug(`📤 RAG activé: ${shouldDoRAG} | Documents trouvés: ${allDocuments.length} → limités à: ${limitedDocuments.length}`);
  limitedDocuments.forEach((doc, i) => {
    const id = doc.study_id || doc.entity_id || doc.id || '?';
    const score = Math.round((doc.finalScore || doc.relevanceScore || doc.similarity || 0) * 100);
    const entityType = doc.entity_type || doc.metadata?.entity_type || '?';
    const name = doc.metadata?.nom || doc.title || 'N/A';
    const source = doc.searchSource || '?';
    logger.debug(`📤   Doc #${i + 1}: ${id} | score=${score}% | type=${entityType} | source=${source} | content=${doc.content?.length || 0} chars | ${name.substring(0, 50)}`);
  });
  logger.debug(`📝 Taille prompt système: ${systemPrompt.length} caractères`);
  logger.debug(`📤 ═══════════════════════════════════════════════════════`);

  // 4. Préparation des messages pour OpenAI
  const limitedHistory = conversationHistory.slice(-6);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...limitedHistory,
    { role: 'user', content: message }
  ];

  // 5. Config modèle selon le type d'IA
  const modelConfig = {
    'basique': {
      model: 'gpt-4o-mini',
      max_tokens: 750,
      temperature: 0.5
    },
    'clinique': {
      model: 'gpt-4.1-mini',
      max_tokens: 2000,
      temperature: 0.3
    },
    'biblio': {
      model: 'gpt-4o-mini',
      max_tokens: 2000,
      temperature: 0.3
    },
    'admin': {
      model: 'gpt-4o-mini',
      max_tokens: 3000,
      temperature: 0.2
    },
    'default': {
      model: 'gpt-4o-mini',
      max_tokens: 1000,
      temperature: 0.7
    }
  };

  const config = modelConfig[type] || modelConfig['default'];

  return { messages, config, limitedDocuments, selectedSources, metadata, redirectDirective };
};

/**
 * Génère une réponse IA pour les kinésithérapeutes avec RAG et sauvegarde (bloquant)
 */
const generateKineResponse = async (type, message, conversationHistory = [], kineId, options = {}) => {
  try {
    const { messages, config, limitedDocuments, selectedSources, metadata } =
      await prepareKineRequest(type, message, conversationHistory, kineId);

    const completion = await openai.chat.completions.create({
      model: config.model,
      messages,
      max_tokens: config.max_tokens,
      temperature: config.temperature,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });

    const aiResponse = completion.choices[0].message.content;

    if (!options.skipSave) {
      await saveToCorrectTable(type, kineId, message, aiResponse);
      logger.debug(`💾 Conversation IA ${type} sauvegardée`);
    }

    const overallConfidence = type === 'admin' ? 1 : knowledgeService.calculateOverallConfidence(limitedDocuments);

    const response = {
      success: true,
      message: aiResponse,
      sources: type === 'admin' ? [] : knowledgeService.formatSources(selectedSources),
      confidence: overallConfidence,
      metadata: {
        model: config.model,
        iaType: type,
        kineId: kineId,
        documentsFound: metadata.totalFound,
        documentsUsedForAI: limitedDocuments.length,
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
 * Génère une réponse IA en streaming (SSE) pour les kinésithérapeutes
 * @param {string} type - Type d'IA (basique, biblio, clinique, admin)
 * @param {string} message - Message du kiné
 * @param {Array} conversationHistory - Historique de la conversation
 * @param {string} kineId - ID du kiné
 * @param {Function} onToken - Callback appelé pour chaque token (delta string)
 * @returns {Object} Réponse complète (même format que generateKineResponse)
 */
const generateKineResponseStream = async (type, message, conversationHistory = [], kineId, onToken, options = {}) => {
  const { messages, config, limitedDocuments, selectedSources, metadata } =
    await prepareKineRequest(type, message, conversationHistory, kineId);

  const stream = await openai.chat.completions.create({
    model: config.model,
    messages,
    max_tokens: config.max_tokens,
    temperature: config.temperature,
    presence_penalty: 0.1,
    frequency_penalty: 0.1,
    stream: true
  });

  let fullResponse = '';

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      fullResponse += delta;
      onToken(delta);
    }
  }

  if (!options.skipSave) {
    await saveToCorrectTable(type, kineId, message, fullResponse);
    logger.debug(`💾 Conversation IA ${type} (stream) sauvegardée`);
  }

  const overallConfidence = type === 'admin' ? 1 : knowledgeService.calculateOverallConfidence(limitedDocuments);

  const response = {
    success: true,
    message: fullResponse,
    sources: type === 'admin' ? [] : knowledgeService.formatSources(selectedSources),
    confidence: overallConfidence,
    metadata: {
      model: config.model,
      iaType: type,
      kineId: kineId,
      documentsFound: metadata.totalFound,
      documentsUsedForAI: limitedDocuments.length,
      documentsDisplayed: selectedSources.length,
      averageRelevance: Math.round(metadata.averageScore * 100),
      categoriesFound: metadata.categoriesFound,
      hasHighQualityContext: limitedDocuments.some(doc => doc.finalScore > 0.8),
      timestamp: new Date().toISOString()
    }
  };

  logger.debug(`✅ IA ${type} (stream) - Confiance: ${Math.round(overallConfidence * 100)}%`);
  return response;
};

/**
 * Sélectionne le prompt système selon le type d'IA
 */
const getSystemPromptByType = (type, contextDocuments, ragEnabled = true) => {
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

  return builder(contextDocuments, ragEnabled);
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

// ========== DÉTECTEUR RAG POUR FOLLOWUP ==========

/**
 * Détermine si un message de suivi nécessite une recherche documentaire (RAG)
 * Mini LLM dédié : ~20 tokens output, température 0, ~100-200ms
 * Retourne { rag: true|false }
 */
const shouldUseRAG = async (message, conversationHistory = []) => {
  try {
    const recentHistory = conversationHistory.slice(-10).map(msg =>
      `${msg.role}: ${msg.content.substring(0, 2500)}`
    ).join('\n');

    const ragDetectorPrompt = `Tu es un query rewriter pour un assistant kiné.

Un kinésithérapeute est en conversation de suivi après une recherche documentaire.
Il a DÉJÀ reçu une réponse sourcée avec des études numérotées (1), (2), etc.

ANALYSE son nouveau message et décide :

rag: true + query optimisée SI :
- Demande des détails sur une étude citée (ex: "décris l'étude 2", "détaille la réf 3") → RÉSOUS la référence dans l'historique et génère une query avec auteur + termes clés du titre
- Demande une info factuelle ABSENTE de la conversation (nouveau sujet, autre pathologie)
- Demande des études ou sources supplémentaires

rag: false SI :
- Reformulation, clarification ou vulgarisation de ce qui a déjà été dit
- Remerciement, salutation, confirmation
- Question d'opinion ou de pratique clinique générale

IMPORTANT pour la query :
- Si l'user référence une étude par numéro, RETROUVE le titre/auteur dans l'historique et construis la query avec ces termes
- La query doit être optimisée pour une recherche vectorielle + BM25 (mots-clés pertinents, pas de mots vides)
- Langue de la query : français (la base contient des abstracts traduits en FR)

Historique récent :
${recentHistory || 'Aucun'}

Message : "${message}"

Réponds UNIQUEMENT en JSON : {"rag": true|false, "query": "requête optimisée ou null si rag=false"}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: ragDetectorPrompt }],
      max_tokens: 100,
      temperature: 0,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content);
    const rag = result.rag === true;
    const query = result.query || null;

    logger.debug(`🔍 shouldUseRAG: rag=${rag}, query="${query}" pour message: "${message.substring(0, 80)}..."`);

    return { rag, query };
  } catch (error) {
    logger.error('❌ Erreur shouldUseRAG:', error.message);
    return { rag: false, query: null };
  }
};

// ========== FONCTION FOLLOWUP (RAG CONDITIONNEL) ==========

/**
 * Génère une réponse de suivi avec RAG conditionnel
 * Utilisée pour les questions de suivi après une recherche initiale (biblio, clinique)
 * shouldUseRAG() décide si on lance une recherche documentaire
 * Sauvegarde dans la table de l'IA source (pas dans chatIaBasique)
 */
const generateFollowupResponse = async (message, conversationHistory = [], kineId, sourceIa, options = {}) => {
  try {
    const validSources = ['biblio', 'clinique'];
    if (!validSources.includes(sourceIa)) {
      throw new Error(`sourceIa invalide: ${sourceIa}. Valeurs acceptées: ${validSources.join(', ')}`);
    }

    logger.debug(`🔄 IA Followup (source: ${sourceIa}) pour kiné ID: ${sanitizeUID(kineId)}`);

    if (!message?.trim()) {
      throw new Error('Message requis');
    }

    // 1. Détection du besoin RAG via mini LLM
    const ragDecision = await shouldUseRAG(message, conversationHistory);
    const searchQuery = ragDecision.query || message;
    logger.debug(`🔍 Followup RAG décision: rag=${ragDecision.rag}, query="${searchQuery}" (source: ${sourceIa})`);

    // 2. Recherche documentaire si RAG activé (avec query optimisée)
    let limitedDocuments = [];
    let selectedSources = [];
    let searchMetadata = { totalFound: 0, averageScore: 0, categoriesFound: [] };

    if (ragDecision.rag) {
      logger.debug(`📚 Followup RAG activé → recherche "${searchQuery}" dans base ${sourceIa}`);

      const searchResult = await knowledgeService.searchDocuments(searchQuery, {
        filterCategory: null,
        allowLowerThreshold: true,
        iaType: sourceIa
      });

      const docLimits = { 'biblio': 6, 'clinique': 6 };
      const maxDocs = docLimits[sourceIa] || 6;

      limitedDocuments = (searchResult.allDocuments || []).slice(0, maxDocs);
      selectedSources = searchResult.selectedSources || [];
      searchMetadata = searchResult.metadata || searchMetadata;

      logger.debug(`📄 Followup RAG - Documents trouvés: ${searchMetadata.totalFound}, limités à: ${limitedDocuments.length}`);
      logger.debug(`📄 Followup RAG - Détail documents:`, limitedDocuments.map((doc, i) => ({
        index: i + 1,
        title: doc.title || 'N/A',
        score: Math.round(doc.finalScore * 100) + '%',
        contentLength: doc.content?.length || 0
      })));
    } else {
      logger.debug(`💬 Followup sans RAG → réponse conversationnelle pure`);
    }

    // 3. Construction du prompt système (adapté selon RAG on/off)
    const contextLabel = sourceIa === 'biblio'
      ? 'bibliographique (études, publications scientifiques)'
      : 'clinique (tests, diagnostics, cotations)';

    let systemPrompt = `Tu es un assistant IA spécialisé en kinésithérapie. Tu réponds à un kinésithérapeute diplômé.

CONTEXTE : Le kiné a lancé une recherche ${contextLabel} et pose maintenant une question de suivi.

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
- PRIORITÉ À L'HISTORIQUE : quand le kiné référence un élément par numéro ("étude 2", "test 3", "réf 1"), il parle TOUJOURS d'un élément déjà cité dans la conversation. Retrouve-le dans l'historique et base ta réponse dessus.
- Les documents complémentaires (RAG) servent uniquement à ENRICHIR ta réponse avec des détails supplémentaires, pas à remplacer l'élément référencé par le kiné.
- Base-toi sur le contexte de la conversation précédente
- Si la question sort du cadre de la discussion, dis-le poliment
- Ne jamais inventer d'études, de chiffres ou de faits
- Si tu ne sais pas, dis-le clairement
- JAMAIS poser de diagnostic médical`;

    // Injection des documents si RAG activé
    if (ragDecision.rag && limitedDocuments.length > 0) {
      systemPrompt += `\n\n📚 DOCUMENTS COMPLÉMENTAIRES (${limitedDocuments.length} document(s)) :
Utilise-les pour enrichir ta réponse. Si non pertinents, ignore-les et base-toi sur l'historique.
`;

      limitedDocuments.forEach((doc, index) => {
        const score = Math.round((doc.finalScore || doc.relevanceScore || doc.similarity || 0) * 100);
        const source = doc.metadata?.nom || doc.metadata?.source_file || doc.title || 'Source non spécifiée';
        const category = doc.category || doc.metadata?.entity_type || doc.metadata?.type_contenu || 'Général';

        systemPrompt += `\n📄 DOCUMENT ${index + 1} (Score: ${score}%)
SOURCE : ${source}
CATÉGORIE : ${category}

CONTENU :
${doc.content}

---
`;
      });
    } else if (ragDecision.rag && limitedDocuments.length === 0) {
      systemPrompt += `\n\n📄 RECHERCHE DOCUMENTAIRE : Aucun document pertinent trouvé pour cette question de suivi.
Base-toi sur le contexte de la conversation et tes connaissances générales. Indique clairement si tu manques d'informations sourcées.`;
    }

    // 4. Historique limité à 10 messages pour garder le contexte biblio/clinique
    const limitedHistory = conversationHistory.slice(-10);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...limitedHistory,
      { role: 'user', content: message }
    ];

    logger.debug(`📝 Followup - Taille prompt système: ${systemPrompt.length} chars, RAG: ${ragDecision.rag}, docs: ${limitedDocuments.length}`);

    // 5. Appel OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 750,
      temperature: 0.5,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });

    const aiResponse = completion.choices[0].message.content;

    // 6. Sauvegarde dans la table de l'IA SOURCE (biblio -> chatIaBiblio, clinique -> chatIaClinique)
    if (!options.skipSave) {
      await saveToCorrectTable(sourceIa, kineId, message, aiResponse);
      logger.debug(`💾 Followup sauvegardé dans table ${sourceIa}`);
    }

    // 7. Calcul de la confiance (uniquement si RAG activé)
    const overallConfidence = limitedDocuments.length > 0
      ? knowledgeService.calculateOverallConfidence(limitedDocuments)
      : null;

    // 8. Réponse finale
    const response = {
      success: true,
      message: aiResponse,
      sources: limitedDocuments.length > 0 ? knowledgeService.formatSources(selectedSources) : [],
      confidence: overallConfidence,
      metadata: {
        model: 'gpt-4o-mini',
        iaType: 'followup',
        sourceIa: sourceIa,
        ragActivated: ragDecision.rag,
        kineId: kineId,
        documentsFound: searchMetadata.totalFound,
        documentsUsedForAI: limitedDocuments.length,
        documentsDisplayed: selectedSources.length,
        timestamp: new Date().toISOString()
      }
    };

    logger.debug(`✅ Followup terminé - RAG: ${ragDecision.rag}, docs: ${limitedDocuments.length}, confiance: ${overallConfidence ? Math.round(overallConfidence * 100) + '%' : 'N/A'}`);
    return response;

  } catch (error) {
    logger.error(`❌ Erreur generateFollowupResponse (source: ${sourceIa}):`, error.message);
    throw {
      success: false,
      error: `Erreur lors de la génération de la réponse de suivi`,
      details: error.message
    };
  }
};

/**
 * Génère une réponse de suivi en streaming (SSE)
 * Même logique que generateFollowupResponse mais avec stream: true + onToken callback
 */
const generateFollowupResponseStream = async (message, conversationHistory = [], kineId, sourceIa, onToken, options = {}) => {
  const validSources = ['biblio', 'clinique'];
  if (!validSources.includes(sourceIa)) {
    throw new Error(`sourceIa invalide: ${sourceIa}. Valeurs acceptées: ${validSources.join(', ')}`);
  }

  logger.debug(`🔄 IA Followup Stream (source: ${sourceIa}) pour kiné ID: ${sanitizeUID(kineId)}`);

  if (!message?.trim()) {
    throw new Error('Message requis');
  }

  // 1. Détection du besoin RAG + query rewriting via mini LLM
  const ragDecision = await shouldUseRAG(message, conversationHistory);
  const searchQuery = ragDecision.query || message;
  logger.debug(`🔍 Followup Stream RAG décision: rag=${ragDecision.rag}, query="${searchQuery}" (source: ${sourceIa})`);

  // 2. Recherche documentaire si RAG activé (avec query optimisée)
  let limitedDocuments = [];
  let selectedSources = [];
  let searchMetadata = { totalFound: 0, averageScore: 0, categoriesFound: [] };

  if (ragDecision.rag) {
    const searchResult = await knowledgeService.searchDocuments(searchQuery, {
      filterCategory: null,
      allowLowerThreshold: true,
      iaType: sourceIa
    });

    const docLimits = { 'biblio': 6, 'clinique': 6 };
    const maxDocs = docLimits[sourceIa] || 6;

    limitedDocuments = (searchResult.allDocuments || []).slice(0, maxDocs);
    selectedSources = searchResult.selectedSources || [];
    searchMetadata = searchResult.metadata || searchMetadata;
  }

  // 3. Construction du prompt système
  const contextLabel = sourceIa === 'biblio'
    ? 'bibliographique (études, publications scientifiques)'
    : 'clinique (tests, diagnostics, cotations)';

  let systemPrompt = `Tu es un assistant IA spécialisé en kinésithérapie. Tu réponds à un kinésithérapeute diplômé.

CONTEXTE : Le kiné a lancé une recherche ${contextLabel} et pose maintenant une question de suivi.

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
- PRIORITÉ À L'HISTORIQUE : quand le kiné référence un élément par numéro ("étude 2", "test 3", "réf 1"), il parle TOUJOURS d'un élément déjà cité dans la conversation. Retrouve-le dans l'historique et base ta réponse dessus.
- Les documents complémentaires (RAG) servent uniquement à ENRICHIR ta réponse avec des détails supplémentaires, pas à remplacer l'élément référencé par le kiné.
- Base-toi sur le contexte de la conversation précédente
- Si la question sort du cadre de la discussion, dis-le poliment
- Ne jamais inventer d'études, de chiffres ou de faits
- Si tu ne sais pas, dis-le clairement
- JAMAIS poser de diagnostic médical`;

  if (ragDecision.rag && limitedDocuments.length > 0) {
    systemPrompt += `\n\n📚 DOCUMENTS COMPLÉMENTAIRES (${limitedDocuments.length} document(s)) :
Utilise-les pour enrichir ta réponse. Si non pertinents, ignore-les et base-toi sur l'historique.
`;
    limitedDocuments.forEach((doc, index) => {
      const score = Math.round((doc.finalScore || doc.relevanceScore || doc.similarity || 0) * 100);
      const source = doc.metadata?.nom || doc.metadata?.source_file || doc.title || 'Source non spécifiée';
      const category = doc.category || doc.metadata?.entity_type || doc.metadata?.type_contenu || 'Général';
      systemPrompt += `\n📄 DOCUMENT ${index + 1} (Score: ${score}%)\nSOURCE : ${source}\nCATÉGORIE : ${category}\n\nCONTENU :\n${doc.content}\n\n---\n`;
    });
  } else if (ragDecision.rag && limitedDocuments.length === 0) {
    systemPrompt += `\n\n📄 RECHERCHE DOCUMENTAIRE : Aucun document pertinent trouvé pour cette question de suivi.
Base-toi sur le contexte de la conversation et tes connaissances générales. Indique clairement si tu manques d'informations sourcées.`;
  }

  const limitedHistory = conversationHistory.slice(-10);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...limitedHistory,
    { role: 'user', content: message }
  ];

  // 4. Appel OpenAI en streaming
  const stream = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 750,
    temperature: 0.5,
    presence_penalty: 0.1,
    frequency_penalty: 0.1,
    stream: true
  });

  let fullResponse = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) {
      fullResponse += delta;
      onToken(delta);
    }
  }

  // 5. Sauvegarde
  if (!options.skipSave) {
    await saveToCorrectTable(sourceIa, kineId, message, fullResponse);
    logger.debug(`💾 Followup (stream) sauvegardé dans table ${sourceIa}`);
  }

  const overallConfidence = limitedDocuments.length > 0
    ? knowledgeService.calculateOverallConfidence(limitedDocuments)
    : null;

  return {
    success: true,
    message: fullResponse,
    sources: limitedDocuments.length > 0 ? knowledgeService.formatSources(selectedSources) : [],
    confidence: overallConfidence,
    metadata: {
      model: 'gpt-4o-mini',
      iaType: 'followup',
      sourceIa: sourceIa,
      ragActivated: ragDecision.rag,
      kineId: kineId,
      documentsFound: searchMetadata.totalFound,
      documentsUsedForAI: limitedDocuments.length,
      documentsDisplayed: selectedSources.length,
      timestamp: new Date().toISOString()
    }
  };
};

// ========== PROMPTS SYSTÈME SPÉCIALISÉS ==========

function buildBasiqueSystemPrompt(contextDocuments, ragEnabled = true) {
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

  // Mode conversationnel simple (rag: false) — pas de bloc documents ni exemples
  if (!ragEnabled) {
    return systemPrompt;
  }

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
      const score = Math.round((doc.finalScore || doc.relevanceScore || doc.similarity || 0) * 100);
      const source = doc.metadata?.nom || doc.metadata?.source_file || doc.title || 'Source non spécifiée';
      const category = doc.metadata?.entity_type || doc.category || doc.metadata?.type_contenu || 'Général';

      systemPrompt += `\n📄 DOCUMENT ${index + 1} (Score: ${score}%) - ${category}
SOURCE : ${source}

CONTENU :
${doc.content}

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
  let systemPrompt = `Tu es une IA spécialisée en recherche bibliographique evidence-based pour kinésithérapeutes.

OBJECTIF : Synthétiser les études scientifiques de notre base pour répondre aux questions cliniques.

STRUCTURE DE RÉPONSE OBLIGATOIRE :

COMMENCE DIRECTEMENT PAR une synthèse claire et concise. Cite les études avec des numéros entre parenthèses dans le texte : (1), (2), etc.

Puis termine TOUJOURS par une section références :

**📚 Références**
(1) Titre de l'étude
Auteurs (Année)
Lien PubMed

(2) Titre de l'étude
Auteurs (Année)
Lien PubMed

RÈGLES DE CITATION :
- Cite les études par numéro dans le texte, ex: "L'exercice excentrique montre des résultats supérieurs (1,3) comparé au travail isométrique (2)"
- Les numéros correspondent aux références listées en bas
- Chaque référence = titre + auteurs (année) + URL PubMed sur la ligne suivante
- Ne jamais inventer de références ou données non mentionnées dans les études fournies

RÈGLES DE SYNTHÈSE :
- Sois concis et pratique — va droit aux recommandations cliniques
- Mentionne les résultats chiffrés quand disponibles (p-values, effectifs, durées)
- Si aucun document fourni → "Je n'ai pas encore d'études disponibles sur ce sujet. Je lance une recherche, n'hésite pas à me reposer la question dans 1 minute."
- Reste cohérent avec l'historique de conversation`;

  if (contextDocuments.length > 0) {
    // 🧪 LOGS SIMPLIFIÉ - Juste le nombre de documents
    logger.debug(`🧪 IA Biblio - ${contextDocuments.length} documents transmis à GPT`);

    // Grouper par pmid (studies_v3 = colonnes plates, pas de metadata jsonb)
    const groupedByStudy = {};
    contextDocuments.forEach((doc) => {
      // Support v3 (colonnes plates) ET v2 legacy (metadata jsonb)
      const key = doc.pmid || doc.metadata?.source_file || doc.title || 'Document sans titre';
      if (!groupedByStudy[key]) {
        groupedByStudy[key] = {
          pmid: doc.pmid || null,
          title: doc.title || doc.metadata?.source_file?.replace('.pdf', '').replace(/_/g, ' ') || 'Titre non disponible',
          authors: doc.authors || doc.metadata?.auteur || 'Auteur non spécifié',
          year: doc.year || doc.metadata?.date || 'Date non spécifiée',
          category: doc.category || doc.metadata?.type_contenu || 'Non spécifié',
          publication_types: doc.publication_types || [],
          doi_url: doc.doi_url || null,
          pubmed_url: doc.pubmed_url || null,
          // Legacy v2 fields
          niveau_preuve: doc.metadata?.niveau_preuve || null,
          pathologies: doc.metadata?.pathologies || [],
          content: doc.content || '',
          bestScore: doc.finalScore || doc.similarity || 0
        };
      } else {
        // Si même étude apparaît plusieurs fois, concaténer le contenu
        if (doc.content && !groupedByStudy[key].content.includes(doc.content)) {
          groupedByStudy[key].content += '\n\n' + doc.content;
        }
        const score = doc.finalScore || doc.similarity || 0;
        if (score > groupedByStudy[key].bestScore) {
          groupedByStudy[key].bestScore = score;
        }
      }
    });

    // Trier par score de pertinence (plus pertinent en premier)
    const sortedStudies = Object.values(groupedByStudy).sort((a, b) => b.bestScore - a.bestScore);

    systemPrompt += `\n\nÉTUDES DISPONIBLES :\n`;

    sortedStudies.forEach((study, index) => {
      const num = index + 1;
      const pubmedLink = study.pubmed_url || (study.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${study.pmid}/` : '');

      systemPrompt += `
(${num}) "${study.title}"
Auteurs : ${study.authors} (${study.year})
PubMed : ${pubmedLink}
Contenu : ${study.content.substring(0, 1200)}

---
`;
    });

    systemPrompt += `\nINSTRUCTIONS FINALES :
- Cite avec (1), (2), etc. dans ta synthèse
- En bas, liste les références avec titre, auteurs (année) et lien PubMed
- Base-toi uniquement sur le contenu des études ci-dessus`;
  } else {
    // Cas où aucun document n'est fourni — l'enrichissement PubMed tourne en background
    systemPrompt += `\n\nAUCUN DOCUMENT FOURNI - Répondre uniquement :
"Je n'ai pas encore d'études disponibles sur ce sujet. Je lance une recherche, n'hésite pas à me reposer la question dans 1 minute."`;
  }

  return systemPrompt;
}

function buildCliniqueSystemPrompt(contextDocuments) {
  let systemPrompt = `Tu es un assistant clinique expert en kinésithérapie musculosquelettique. Tu aides les kinés à poser les bonnes hypothèses et choisir les bons tests, dans le bon ordre.

RÈGLES :
- Base-toi sur les documents fournis ci-dessous. Tu peux reformuler et synthétiser leur contenu.
- N'invente jamais de données chiffrées (sensibilité, spécificité, LR) non présentes dans les documents.
- Si des informations manquent, dis-le clairement.

TESTS DÉJÀ RÉALISÉS :
Si le kiné mentionne des tests avec résultats (ex: "Neer positif", "Jobe négatif") :
- Utilise ces résultats pour orienter tes hypothèses
- Ne re-propose pas ces tests, propose uniquement des tests complémentaires`;

  // Injection des documents RAG
  if (contextDocuments.length > 0) {
    systemPrompt += `\n\nDOCUMENTS CLINIQUES (${contextDocuments.length}) :\n`;

    const groups = {
      test: { label: 'TESTS', docs: [] },
      pathologie: { label: 'PATHOLOGIES', docs: [] },
      presentation: { label: 'PRÉSENTATIONS', docs: [] },
      cpr: { label: 'CPR', docs: [] },
      other: { label: 'AUTRES', docs: [] }
    };

    contextDocuments.forEach(doc => {
      const entityType = doc.metadata?.entity_type || doc.entity_type || '';
      if (groups[entityType]) {
        groups[entityType].docs.push(doc);
      } else {
        groups.other.docs.push(doc);
      }
    });

    for (const [, group] of Object.entries(groups)) {
      if (group.docs.length === 0) continue;
      systemPrompt += `\n${group.label} :\n`;
      group.docs.forEach(doc => {
        const name = doc.metadata?.nom || doc.title || '';
        systemPrompt += `\n[${name}]\n${doc.content}\n---\n`;
      });
    }
  }

  systemPrompt += `\n\nFORMAT DE RÉPONSE :
Adapte selon la complexité. Utilise uniquement les sections pertinentes :

**Hypothèses diagnostiques** — Causes probables, du plus fréquent au plus grave. Si des tests sont déjà réalisés, commence par interpréter leurs résultats.

**Tests recommandés** — Pour chaque test :
- Procédure (position patient, geste, critère de positivité)
- Interprétation (signification test + ou -)

**Arbre décisionnel** — Seulement si diagnostic différentiel. Enchaînement logique : Si Test A + → faire X. Si Test A - → tester Y.

**Red flags** — Uniquement si les documents en mentionnent.

**Synthèse** — Hypothèse principale, prochaine étape, orientation si nécessaire (imagerie, spécialiste).

Format professionnel sobre, sans emojis, markdown avec titres en gras. Question simple → réponse directe. Cas complexe → structure complète.`;

  return systemPrompt;
}

function buildAdministrativeSystemPrompt() {
  const systemPrompt = `Tu es un assistant IA spécialisé dans la RÉDACTION DE BILANS KINÉSITHÉRAPIQUES PROFESSIONNELS.

MISSION : Restructurer les notes brutes du kinésithérapeute en un bilan professionnel. Tu dispatches chaque information dans la section appropriée et la reformules en phrases médicales fluides. Tu ne résumes pas, tu ne synthétises pas, tu ne complètes pas. Tu restructures fidèlement.

FORMAT : Commencer par le titre "<u>BILAN KINÉSITHÉRAPIQUE</u>" en première ligne. Chaque titre de section est précédé d'une puce • et souligné avec balise HTML <u> (ex: • <u>Identification</u>), contenu directement en dessous sans ligne vide. Pas de formule de politesse. Pas de listes à puces dans le contenu. Ton médical professionnel et neutre.

STRUCTURE (7 SECTIONS CONDITIONNELLES) :

1. Identification (OBLIGATOIRE)
• <u>Identification</u>
[M./Mme] [Nom/Initiales], [âge] ans, [profession si mentionnée], consulte pour [motif de consultation]. Si un motif de consultation est fourni séparément, l'intégrer ici. Si le motif est absent, utiliser le motif principal extrait des notes.

2. Antécédents (OBLIGATOIRE)
• <u>Antécédents</u>
Reformuler les antécédents médicaux, chirurgicaux ou traumatiques mentionnés par le kiné. Si aucun antécédent n'est mentionné dans les notes, écrire : "RAS."

3. Examen clinique (si informations disponibles)
• <u>Examen clinique</u>
Regrouper ici UNIQUEMENT les éléments présents dans les notes : douleur (localisation, type, intensité EVA si chiffrée, contexte), observation posturale, bilan articulaire (amplitudes si mesurées), testing musculaire (cotations si notées), tests spécifiques (noms et résultats si fournis). Reprendre la latéralité exactement comme le kiné l'a notée (D, G, droite, gauche, bilatéral...). Ne jamais mentionner les éléments absents.

4. Limitations fonctionnelles (si mentionnées)
• <u>Limitations fonctionnelles</u>
Activités de la vie quotidienne, professionnelles ou sportives impactées.

5. Diagnostic kinésithérapique (si les notes le permettent)
• <u>Diagnostic kinésithérapique</u>
Formuler le diagnostic tel que le kiné l'a orienté. Si les notes sont vagues, rester descriptif ("Le bilan évoque...").

6. Objectifs (si mentionnés)
• <u>Objectifs</u>
Reprendre les objectifs tels que formulés par le kiné (court terme, moyen terme, long terme si précisé).

7. Traitement (si mentionné)
• <u>Traitement</u>
Reprendre les techniques mentionnées par le kiné et les organiser de façon lisible : techniques passives (massages, mobilisations, électrothérapie...), techniques actives (renforcement, proprioception, étirements...), éducation thérapeutique, auto-exercices, fréquence et durée si précisées. Ne structurer que ce qui est mentionné.

RÈGLES :
- IDENTIFICATION et ANTÉCÉDENTS sont toujours présents. Les autres sections n'apparaissent QUE si les notes contiennent des informations correspondantes
- Si une section optionnelle est vide, ne pas afficher son titre
- Phrases complètes, connecteurs logiques, vocabulaire médical précis
- Conserver toutes les mesures exactes du kiné (EVA, degrés, cotations, distances)
- La longueur du bilan est proportionnelle aux notes : notes courtes = bilan court, notes détaillées = bilan détaillé

---

EXEMPLE COMPLET :

<u>BILAN KINÉSITHÉRAPIQUE</u>

• <u>Identification</u>
Monsieur D., 45 ans, professeur de sport, consulte pour une douleur à l'épaule droite suite à une chute à ski survenue il y a 3 semaines.

• <u>Antécédents</u>
Le patient a pour antécédents une entorse de l'épaule gauche il y a 5 ans bien récupérée et une hypertension artérielle traitée.

• <u>Examen clinique</u>
Le patient décrit une douleur antéro-latérale de l'épaule droite irradiant parfois vers le biceps, cotée à 2/10 au repos et 7/10 en mouvement, avec une gêne nocturne importante. À l'examen clinique, on observe une attitude antalgique avec épaule en rotation interne. Le bilan articulaire révèle une flexion active limitée à 120° (passive 145°), une abduction active à 90° avec arc douloureux entre 60-90°, et une rotation externe limitée à 30° (normale 45°). Le testing musculaire montre un deltoïde à 4/5 et un supra-épineux à 3+/5. Les tests de Jobe, Hawkins-Kennedy et Neer sont positifs.

• <u>Limitations fonctionnelles</u>
Sur le plan fonctionnel, le patient ne peut plus travailler bras levés, a cessé toute activité sportive depuis 3 semaines et rencontre des difficultés pour s'habiller.

• <u>Diagnostic kinésithérapique</u>
Le diagnostic kinésithérapique s'oriente vers une tendinopathie de la coiffe des rotateurs avec probable atteinte du supra-épineux.

• <u>Objectifs</u>
Les objectifs à court terme visent la diminution de la douleur et la récupération des amplitudes articulaires. À moyen/long terme : reprise du sport et autonomie complète dans les activités de la vie quotidienne.

• <u>Traitement</u>
Le traitement proposé comprend un lever de tension, un renforcement progressif de la coiffe, de la proprioception et une reprise progressive des gestes sportifs adaptés, à raison de 3 séances par semaine sur une durée estimée de 6 à 8 semaines.

---

CONTRE-EXEMPLE :

Notes : "Patient de 50 ans, douleur épaule droite depuis 2 semaines, gêne la nuit"

MAUVAIS : "Le patient a pour antécédents une tendinite de l'épaule gauche. La douleur est cotée à 6/10. L'abduction est limitée à 90°. Le test de Jobe est positif."
Pourquoi : invente antécédents, EVA, amplitudes et test clinique.

BON :

<u>BILAN KINÉSITHÉRAPIQUE</u>

• <u>Identification</u>
Monsieur X., 50 ans, consulte pour une douleur à l'épaule droite apparue il y a 2 semaines.

• <u>Antécédents</u>
RAS.

• <u>Examen clinique</u>
Le patient rapporte une gêne nocturne importante.

(3 sections seulement car notes minimalistes — c'est correct.)

---

ANTI-HALLUCINATION :
- JAMAIS inventer de données absentes des notes (mesures, tests, diagnostic, objectifs, techniques)
- JAMAIS commenter ou signaler l'absence d'une information ("non fourni", "non mentionné", "non renseigné", "à évaluer", "aucun X mentionné dans les notes", "les détails ne sont pas fournis", etc.)
- JAMAIS afficher un titre de section sans contenu (sauf Antécédents qui affiche toujours "RAS." si rien n'est mentionné)
- Si une donnée n'est PAS dans les notes du kiné, elle N'EXISTE PAS dans le bilan — ne pas la mentionner, ne pas signaler son absence
- Un bilan court mais fidèle aux notes vaut toujours mieux qu'un bilan long avec des inventions ou des commentaires sur les données manquantes`;

  return systemPrompt;
}

module.exports = {
  // Nouvelles fonctions IA Kiné
  generateKineResponse,
  generateKineResponseStream,
  generateFollowupResponse,
  generateFollowupResponseStream,

  // Anciennes fonctions chat patients (conservées)
  generateChatResponse,
  generateWelcomeMessage,
  anonymizePatientData,
  validateMessage,
  cleanChatHistory
};