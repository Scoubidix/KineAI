const { OpenAI } = require('openai');
const knowledgeService = require('./knowledgeService');
const prismaService = require('./prismaService');
const logger = require('../utils/logger');
const { sanitizeUID, sanitizeName } = require('../utils/logSanitizer');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Fonction pour anonymiser les données patient
const anonymizePatientData = (patient, programmes) => {
  return {
    patientInfo: {
      age: calculateAge(patient.birthDate),
      genre: patient.genre || 'Non spécifié',
      goals: patient.goals || 'Objectifs non spécifiés'
      // Aucune donnée d'identité (nom, prénom, email, téléphone, etc.)
    },
    programmes: programmes.map(prog => ({
      titre: prog.titre,
      description: prog.description,
      duree: prog.duree,
      dateDebut: prog.dateDebut,
      statut: prog.statut || 'actif',
      exercices: prog.exercices?.map(ex => ({
        nom: ex.exerciceModele?.nom || ex.nom,
        series: ex.series,
        repetitions: ex.repetitions,
        pause: ex.pause || ex.tempsRepos,
        consigne: ex.consigne || ex.instructions,
        difficulte: ex.difficulte || 'modérée',
        materiel: ex.materiel || 'aucun'
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
   • ${ex.series} séries × ${ex.repetitions} répétitions
   • ⏱️ Pause: ${ex.pause}s entre séries
   • 🔧 Matériel: ${ex.materiel}
   • 📈 Difficulté: ${ex.difficulte}
   ${ex.consigne ? `• 📝 Instructions: ${ex.consigne}` : ''}
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
- Expliquer la bonne exécution des exercices prescrits (sans les modifier)
- Rediriger vers le kinésithérapeute pour toute modification de programme
- Garder des réponses proportionnées au problème signalé
- NE JAMAIS afficher les consignes techniques dans les réponses

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

    // Anonymiser les données
    const anonymizedData = anonymizePatientData(patientData, programmes);
    
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

    // Appel à OpenAI avec GPT-3.5-turbo
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages,
      max_tokens: 400,
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
      model: 'gpt-3.5-turbo'
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
      model: 'gpt-3.5-turbo'
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
    const anonymizedData = anonymizePatientData(patientData, programmes);
    const systemPrompt = generateSystemPrompt(anonymizedData);
    
    const welcomePrompt = `Tu es un assistant kinésithérapeute virtuel bienveillant. Génère UNIQUEMENT un message d'accueil personnalisé et professionnel.

TÂCHE:
- Commence par "Bonjour ! 👋"
- Présente-toi comme l'assistant kinésithérapeute virtuel
- Présente le programme du jour avec les exercices spécifiques
- Utilise quelques émojis (4-6 maximum) pour égayer le message
- Adapte le ton en fonction de l'âge du patient (${anonymizedData.patientInfo.age} ans)
- Termine par le rappel de validation des exercices
- Mentionner qu'il peut poser des questions sur ses exercices
- Maximum 180 mots

STRUCTURE ATTENDUE:
Bonjour ! 👋

Je suis votre assistant kinésithérapeute virtuel 💪

📋 Programme du jour :
• [Exercice 1] : [détails]
• [Exercice 2] : [détails]

[Conseils motivants courts]

✅ Pensez à valider vos exercices une fois terminés pour tenir votre kinésithérapeute informé !

N'hésitez pas à me poser des questions si vous avez besoin d'aide avec vos exercices. Comment vous sentez-vous aujourd'hui ? 😊

IMPORTANT: 
- Réponds UNIQUEMENT avec le message d'accueil
- Ne pas mentionner d'informations personnelles
- Ne pas afficher de règles ou consignes dans ta réponse
- Ton naturel et professionnel`;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: welcomePrompt }
      ],
      max_tokens: 180,
      temperature: 0.8,
      top_p: 0.9
    });

    return {
      success: true,
      message: response.choices[0].message.content.trim(),
      model: 'gpt-3.5-turbo'
    };

  } catch (error) {
    logger.error('Erreur génération message d\'accueil:', error.message);
    
    // Message d'accueil de fallback simple et propre
    let fallbackMessage = 'Bonjour ! 👋\n\n';
    fallbackMessage += 'Je suis votre assistant kinésithérapeute virtuel 💪 Je suis là pour vous accompagner dans votre programme de rééducation.\n\n';

    if (programmes.length > 0) {
      fallbackMessage += '📋 Programme du jour :\n';
      const exercices = programmes[0]?.exercices?.slice(0, 3) || [];
      if (exercices.length > 0) {
        exercices.forEach((ex) => {
          const nom = ex.exerciceModele?.nom || ex.nom;
          const pause = ex.pause || 30;
          fallbackMessage += `• ${nom} : ${ex.series} séries de ${ex.repetitions} répétitions (pause : ${pause} secondes)\n`;
        });
      } else {
        fallbackMessage += '• Exercices de rééducation personnalisés\n';
      }
      fallbackMessage += '\nMaintenez une bonne posture et écoutez votre corps pendant vos exercices.\n\n';
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
    const searchResult = await knowledgeService.searchDocuments(message, {
      filterCategory: null,
      allowLowerThreshold: true,
      iaType: type  // NOUVEAU: Passer le type d'IA pour les filtres adaptés
    });

    const { allDocuments, selectedSources, metadata } = searchResult;

    // 2. Construction du prompt système selon le type
    const systemPrompt = getSystemPromptByType(type, allDocuments.slice(0, 6));

    // 3. Préparation des messages pour OpenAI
    const limitedHistory = conversationHistory.slice(-6);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...limitedHistory, // Limiter l'historique
      { role: 'user', content: message }
    ];

    // 4. Appel OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      max_tokens: 1000,
      temperature: 0.7,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });

    const aiResponse = completion.choices[0].message.content;

    // 5. Sauvegarde dans la bonne table
    await saveToCorrectTable(type, kineId, message, aiResponse);
    logger.debug(`💾 Conversation IA ${type} sauvegardée`);

    // 6. Calcul de la confiance globale
    const overallConfidence = knowledgeService.calculateOverallConfidence(allDocuments);

    // 7. Construction de la réponse finale
    const response = {
      success: true,
      message: aiResponse,
      sources: knowledgeService.formatSources(selectedSources),
      confidence: overallConfidence,
      metadata: {
        model: 'gpt-3.5-turbo',
        iaType: type,
        kineId: kineId,
        documentsFound: metadata.totalFound,
        documentsUsedForAI: Math.min(allDocuments.length, 6),
        documentsDisplayed: selectedSources.length,
        averageRelevance: Math.round(metadata.averageScore * 100),
        categoriesFound: metadata.categoriesFound,
        hasHighQualityContext: allDocuments.some(doc => doc.finalScore > 0.8),
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

// ========== PROMPTS SYSTÈME SPÉCIALISÉS ==========

function buildBasiqueSystemPrompt(contextDocuments) {
  let systemPrompt = `ATTENTION : Tu parles à un KINÉSITHÉRAPEUTE PROFESSIONNEL, PAS à un patient !

Tu es un assistant IA conversationnel pour AIDER LES KINÉSITHÉRAPEUTES dans leur travail. L'utilisateur qui te parle est un kinésithérapeute diplômé qui traite des patients.

RÔLE : Assistant conversationnel pour kinésithérapeutes
UTILISATEUR : Un kinésithérapeute professionnel (pas un patient)
OBJECTIF : Donner des conseils thérapeutiques professionnels généraux`;

  if (contextDocuments.length > 0) {
    systemPrompt += `\n\nDOCUMENTS DE RÉFÉRENCE PROFESSIONNELS :
`;

    contextDocuments.forEach((doc, index) => {
      const score = Math.round(doc.finalScore * 100);
      
      systemPrompt += `📄 Document ${index + 1} (Score: ${score}%) - "${doc.title}" [${doc.category || 'Général'}] :
${doc.content.substring(0, 800)}

`;
    });
  }

  systemPrompt += `\n\nINSTRUCTIONS :
- TOUJOURS s'adresser au kinésithérapeute, jamais au patient
- Donner des conseils de professionnel à professionnel
- Utiliser "vos patients", "dans votre pratique", "je vous recommande"
- Être précis et technique dans tes recommandations`;

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
  let systemPrompt = `Tu es un assistant clinique pour un kinésithérapeute professionnel.

RÔLE : Assistant clinique spécialisé
UTILISATEUR : Kinésithérapeute en situation clinique
OBJECTIF : Aide à la prise en charge clinique, diagnostic kinésithérapique, techniques thérapeutiques`;

  if (contextDocuments.length > 0) {
    systemPrompt += `\n\nDOCUMENTS CLINIQUES DE RÉFÉRENCE :
`;

    contextDocuments.forEach((doc, index) => {
      const score = Math.round(doc.finalScore * 100);
      
      systemPrompt += `🏥 Document ${index + 1} (Pertinence: ${score}%) - "${doc.title}" :
${doc.content.substring(0, 800)}

`;
    });
  }

  systemPrompt += `\n\nFOCUS : Diagnostic kinésithérapique, techniques de traitement, protocoles cliniques, évaluation.`;

  return systemPrompt;
}

function buildAdministrativeSystemPrompt(contextDocuments) {
  let systemPrompt = `Tu es un assistant administratif pour un kinésithérapeute professionnel.

RÔLE : Assistant administratif spécialisé
UTILISATEUR : Kinésithérapeute gérant son cabinet
OBJECTIF : Aide administrative, réglementaire, gestion de cabinet, facturation, législation`;

  if (contextDocuments.length > 0) {
    systemPrompt += `\n\nDOCUMENTS ADMINISTRATIFS DE RÉFÉRENCE :
`;

    contextDocuments.forEach((doc, index) => {
      const score = Math.round(doc.finalScore * 100);
      
      systemPrompt += `📋 Document ${index + 1} (Pertinence: ${score}%) - "${doc.title}" :
${doc.content.substring(0, 800)}

`;
    });
  }

  systemPrompt += `\n\nFOCUS : Réglementation, facturation, gestion de cabinet, aspects légaux, démarches administratives.`;

  return systemPrompt;
}

module.exports = {
  // Nouvelles fonctions IA Kiné
  generateKineResponse,
  
  // Anciennes fonctions chat patients (conservées)
  generateChatResponse,
  generateWelcomeMessage,
  anonymizePatientData,
  validateMessage,
  cleanChatHistory
};