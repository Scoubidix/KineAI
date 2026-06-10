const { OpenAI } = require('openai');
const knowledgeService = require('./knowledgeService');
const prismaService = require('./prismaService');
const gcsStorageService = require('./gcsStorageService');
const logger = require('../utils/logger');
const { sanitizeUID, sanitizeName } = require('../utils/logSanitizer');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
const llmService = require('./llmService');
// Prompts système des IAs kiné (extraits — voir promptService.js). Ré-exporté plus bas.
const { getSystemPromptByType } = require('./promptService');

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
Afficher TOUS les exercices du programme, sans exception et dans l'ordre fourni
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

EXEMPLE DE RÉSULTAT ATTENDU (le nombre d'exercices ci-dessous est purement illustratif — toujours afficher TOUS les exercices du programme réel) :
Bonjour ! 👋

Je suis votre assistant kinésithérapeute virtuel, ici pour vous accompagner dans votre rééducation.

📋 Programme du jour :

• Étirement des ischio-jambiers : 3 séries × 30 secondes (maintien 20s)
![Démonstration](url_gif_etirement)

• Renforcement quadriceps : 3 séries × 12 répétitions
![Démonstration](url_gif_quadriceps)

• Gainage : 3 séries × 1 répétition (maintien 45s)
![Démonstration](url_gif_gainage)

(... et ainsi de suite pour TOUS les exercices restants du programme)

✅ Pensez à valider vos exercices une fois terminés - cela aide votre kinésithérapeute à suivre vos progrès !

N'hésitez pas à me poser des questions sur vos exercices. Comment vous sentez-vous aujourd'hui ?

IMPORTANT - AFFICHAGE DES GIFS :
- Réponds UNIQUEMENT avec le message d'accueil formaté
- Suis la structure à la lettre
- Ne mentionne JAMAIS d'informations personnelles
- UTILISE LES URLS DES GIFS fournis dans les données des exercices (champ Démonstration)
- SI un exercice a un GIF (Démonstration : url) → affiche-le IMMÉDIATEMENT après cet exercice avec la syntaxe markdown ![Démonstration](url)
- Chaque GIF doit être placé JUSTE APRÈS son exercice correspondant (pas groupés à la fin)
- Affiche le GIF de CHAQUE exercice qui en a un (pas de plafond, pas de sélection)
- SI aucun exercice n'a de GIF → n'affiche PAS de GIF du tout (ne pas utiliser de GIF générique)`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: welcomePrompt }
      ],
      max_tokens: 1500, // GPT génère des pseudo-URLs courtes (https://gif/0) remplacées après. 1500 couvre ~20 exos.
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
      const exercices = programmes[0]?.exercices || [];
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
- CLINIC : Cas clinique complexe, diagnostic différentiel, tests diagnostiques spécifiques (réalisation, fiabilité, sensibilité/spécificité, interprétation), cotations musculaires, "test de Lachman", "diagnostic épaule"

RAG (recherche documentaire) :
- true : Le kiné cherche une information spécifique qui nécessite des sources (tests, mesures, cotations, protocoles précis, données chiffrées)
- false : Question conversationnelle, conseil général, explication vulgarisée, salutation, remerciement, organisation

QUERY (réécriture pour la recherche documentaire) :
- Reformule le message en une question autonome et complète, en résolvant les références à l'historique ("ce test", "cette étude", "et pour l'épaule ?", "le 2ème")
- Garde le français, garde les termes médicaux précis
- Si le message est déjà autonome, recopie-le tel quel

CONTINUITÉ DE CONVERSATION :
Pour un message de suivi court ou ambigu qui poursuit le fil en cours, conserve le type des derniers échanges. Ne change de type que si la nature de la tâche change clairement.

Exemples :
- "Bonjour" → {"type":"BASIC","rag":false,"query":"Bonjour"}
- "Comment expliquer une tendinopathie à un patient ?" → {"type":"BASIC","rag":false,"query":"Comment expliquer une tendinopathie à un patient ?"}
- "C'est quoi le test de Lachman ?" → {"type":"BASIC","rag":true,"query":"C'est quoi le test de Lachman ?"}
- "Quels traitements optimaux pour la lombalgie ?" → {"type":"BIBLIO","rag":true,"query":"Quels traitements optimaux pour la lombalgie ?"}
- "Patient 45 ans douleur épaule après tennis" → {"type":"CLINIC","rag":true,"query":"Patient 45 ans douleur épaule après tennis"}
- "Quelle est la fiabilité du test de Thessaly ?" → {"type":"CLINIC","rag":true,"query":"Fiabilité du test de Thessaly pour les lésions méniscales"}
- (historique sur le test de Lachman) "Et sa sensibilité ?" → {"type":"CLINIC","rag":true,"query":"Quelle est la sensibilité du test de Lachman ?"}
- (historique : cas clinique épaule en cours) "ok et niveau prise en charge ?" → {"type":"CLINIC","rag":true,"query":"Prise en charge kinésithérapique d'un conflit sous-acromial de l'épaule"}
- (historique : cas clinique épaule en cours) "comment je l'explique simplement à mon patient ?" → {"type":"BASIC","rag":false,"query":"Comment expliquer un conflit sous-acromial à un patient"}
- "Merci pour l'info" → {"type":"BASIC","rag":false,"query":"Merci pour l'info"}

Historique récent :
${recentHistory || 'Aucun'}

Message : "${message}"

Réponds UNIQUEMENT en JSON : {"type":"BASIC"|"BIBLIO"|"CLINIC","rag":true|false,"query":"..."}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: routerPrompt }],
      max_tokens: 150,
      temperature: 0,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(response.choices[0].message.content);
    const routedType = ROUTER_TYPE_MAP[result.type] || 'basique';
    const rag = result.rag !== false;
    const query = (typeof result.query === 'string' && result.query.trim()) ? result.query.trim() : message;

    logger.debug(`🔀 Query Router: type=${result.type} (${routedType}), rag=${rag}, query="${query.substring(0, 120)}"`);

    return { type: routedType, rag, query };
  } catch (error) {
    logger.error('❌ Erreur Query Router:', error.message);
    return { type: 'basique', rag: true, query: message };
  }
};

/**
 * Génère un titre court de conversation (chat unifié) — appel utilitaire GPT direct,
 * volontairement hors llmService (comme le router) : toujours gpt-4o-mini.
 */
const generateConversationTitle = async (userMessage, assistantResponse) => {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: `Génère un titre très court (maximum 6 mots, en français, sans guillemets ni ponctuation finale) résumant cette conversation de kinésithérapie.

Question : "${userMessage.substring(0, 500)}"
Réponse : "${(assistantResponse || '').substring(0, 500)}"

Réponds UNIQUEMENT avec le titre.`
    }],
    max_tokens: 30,
    temperature: 0.3
  });

  return response.choices[0].message.content.trim().replace(/^["«\s]+|["»\s]+$/g, '');
};

// ========== NOUVELLE FONCTION PRINCIPALE POUR LES IA KINÉ ==========

/**
 * Prépare la requête IA admin/bilan : prompt système + messages.
 * Les 3 IAs de chat (basique/biblio/clinique) passent désormais par chatUnifiedService —
 * plus de router, de RAG ni de glossaire ici (l'admin n'en utilise pas).
 */
const prepareKineRequest = async (type, message, conversationHistory = [], kineId) => {
  logger.debug(`🚀 IA ${type} pour kiné ID: ${sanitizeUID(kineId)}`);

  if (!message?.trim()) {
    throw new Error('Message requis');
  }

  const systemPrompt = getSystemPromptByType(type, [], false);

  const limitedHistory = conversationHistory.slice(-6);

  const messages = [
    { role: 'system', content: systemPrompt },
    ...limitedHistory,
    { role: 'user', content: message }
  ];

  // Le choix du modèle/params est centralisé dans llmService (par iaType + provider).
  return {
    messages,
    limitedDocuments: [],
    selectedSources: [],
    metadata: { totalFound: 0, averageScore: 0, categoriesFound: [] }
  };
};

/**
 * Génère une réponse IA pour les kinésithérapeutes avec RAG et sauvegarde (bloquant)
 */
const generateKineResponse = async (type, message, conversationHistory = [], kineId, options = {}) => {
  try {
    const { messages, limitedDocuments, selectedSources, metadata } =
      await prepareKineRequest(type, message, conversationHistory, kineId);

    const completion = await llmService.chatCompletion({ iaType: type, messages });

    const aiResponse = completion.content;

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
        model: completion.model,
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
  const { messages, limitedDocuments, selectedSources, metadata } =
    await prepareKineRequest(type, message, conversationHistory, kineId);

  const completion = await llmService.chatCompletion({
    iaType: type,
    messages,
    stream: true,
    onToken,
  });

  const fullResponse = completion.content;

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
      model: completion.model,
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

module.exports = {
  // IA admin/bilan
  generateKineResponse,
  generateKineResponseStream,

  // Chat unifié (conversations)
  routeQuery,
  getSystemPromptByType,
  generateConversationTitle,

  // Anciennes fonctions chat patients (conservées)
  generateChatResponse,
  generateWelcomeMessage,
  anonymizePatientData,
  validateMessage,
  cleanChatHistory
};