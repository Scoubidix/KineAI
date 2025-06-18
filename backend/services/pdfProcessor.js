// services/pdfProcessor.js - VERSION OPTIMISÉE
const pdf = require('pdf-parse');
const { storeDocument, generateEmbedding } = require('./embeddingService');
const { supabase } = require('./supabaseClient');

/**
 * Traite un buffer PDF et l'ajoute à la base vectorielle - VERSION OPTIMISÉE
 */
async function processPDF(buffer, title, category, metadata = {}) {
  try {
    console.log('🔄 Traitement PDF optimisé:', title);
    
    // Extraire le texte du PDF
    const data = await pdf(buffer);
    const fullText = data.text;
    
    console.log('📄 Texte extrait:', fullText.length, 'caractères');
    console.log('📖 Pages:', data.numpages);
    
    // 1. NETTOYAGE AVANCÉ du texte
    const cleanText = advancedCleanText(fullText);
    const spaceSavings = ((fullText.length - cleanText.length) / fullText.length * 100).toFixed(1);
    console.log(`🧹 Nettoyage: ${spaceSavings}% d'espace économisé`);
    
    // 2. CHUNKING INTELLIGENT par sections
    const chunks = intelligentChunking(cleanText, title);
    console.log(`✂️ Chunking intelligent: ${chunks.length} sections créées`);
    
    // 3. DÉDUPLICATION des chunks similaires
    const uniqueChunks = await deduplicateChunks(chunks);
    const dedupeRatio = ((chunks.length - uniqueChunks.length) / chunks.length * 100).toFixed(1);
    console.log(`🔄 Déduplication: ${dedupeRatio}% de chunks supprimés`);
    
    // 4. STOCKAGE OPTIMISÉ
    const results = [];
    for (let i = 0; i < uniqueChunks.length; i++) {
      const chunk = uniqueChunks[i];
      const optimizedTitle = uniqueChunks.length > 1 ? 
        `${title} - Partie ${i + 1}/${uniqueChunks.length}` : title;
      
      // Métadonnées compressées
      const compressedMetadata = compressMetadata({
        ...metadata,
        pages: data.numpages,
        chunkIndex: i,
        totalChunks: uniqueChunks.length,
        originalLength: fullText.length,
        cleanedLength: chunk.content.length,
        type: uniqueChunks.length > 1 ? 'pdf_chunk' : 'pdf_single'
      });
      
      console.log(`🔄 Stockage chunk optimisé ${i + 1}/${uniqueChunks.length}`);
      
      const result = await storeDocument(
        optimizedTitle,
        chunk.content,
        category,
        compressedMetadata
      );
      
      results.push(result);
    }
    
    const totalSavings = calculateSpaceSavings(fullText.length, results);
    console.log(`🎉 PDF traité avec ${totalSavings}% d'économie d'espace`);
    
    return results;
    
  } catch (error) {
    console.error('❌ Erreur traitement PDF optimisé:', error);
    throw new Error(`Erreur traitement PDF: ${error.message}`);
  }
}

/**
 * NETTOYAGE AVANCÉ du texte pour économiser l'espace
 */
function advancedCleanText(text) {
  return text
    // Supprimer les métadonnées PDF inutiles
    .replace(/^.*?Created by.*$/gm, '')
    .replace(/^.*?Producer.*$/gm, '')
    .replace(/^.*?CreationDate.*$/gm, '')
    
    // Supprimer les numéros de page isolés
    .replace(/^\s*\d+\s*$/gm, '')
    
    // Supprimer les headers/footers répétitifs
    .replace(/^.*?Copyright.*$/gm, '')
    .replace(/^.*?www\..*$/gm, '')
    
    // Normaliser les espaces et retours à la ligne
    .replace(/\n{4,}/g, '\n\n\n') // Max 3 retours à la ligne
    .replace(/\s{4,}/g, '   ') // Max 3 espaces consécutifs
    .replace(/\t+/g, ' ') // Tabs → espaces
    
    // Supprimer les caractères de contrôle inutiles
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    
    // Supprimer les lignes de tirets/underscores
    .replace(/^[-_=]{3,}$/gm, '')
    
    // Nettoyer les espaces en début/fin
    .trim();
}

/**
 * CHUNKING INTELLIGENT par sections logiques
 */
function intelligentChunking(text, title) {
  console.log('🧠 Chunking intelligent en cours...');
  
  // 1. Identifier les délimiteurs de sections
  const sectionDelimiters = [
    /(?=\d+\.\s+[A-ZÀÁÂÄÈÉÊË])/g, // "1. TITRE"
    /(?=#+\s+[A-ZÀÁÂÄÈÉÊË])/g, // "## TITRE"
    /(?=EXERCICE\s+\d+)/gi, // "EXERCICE 1"
    /(?=PROTOCOLE)/gi, // "PROTOCOLE"
    /(?=ÉTAPE\s+\d+)/gi, // "ÉTAPE 1"
    /(?=PHASE\s+\d+)/gi, // "PHASE 1"
    /(?=[A-ZÀÁÂÄÈÉÊË]{3,}:)/g // "OBJECTIFS:"
  ];
  
  // 2. Découper par sections logiques
  let sections = [text];
  for (const delimiter of sectionDelimiters) {
    const newSections = [];
    for (const section of sections) {
      const parts = section.split(delimiter);
      if (parts.length > 1) {
        newSections.push(parts[0]);
        for (let i = 1; i < parts.length; i++) {
          newSections.push(parts[i]);
        }
      } else {
        newSections.push(section);
      }
    }
    sections = newSections;
  }
  
  // 3. Filtrer et optimiser les sections
  const optimizedChunks = sections
    .map(section => section.trim())
    .filter(section => {
      // Supprimer les sections trop courtes ou vides
      if (section.length < 50) return false;
      
      // Supprimer les sections qui ne sont que des caractères spéciaux
      if (!/[a-zA-ZàáâäèéêëîïôöùúûüÀÁÂÄÈÉÊËÎÏÔÖÙÚÛÜ]/.test(section)) return false;
      
      return true;
    })
    .map(section => {
      // Limiter la taille maximale par chunk
      if (section.length > 1200) {
        return splitLongSection(section, 1200, 100);
      }
      return [{ content: section, priority: calculateSectionPriority(section, title) }];
    })
    .flat();
  
  console.log(`✂️ ${optimizedChunks.length} sections intelligentes créées`);
  return optimizedChunks;
}

/**
 * Découpe une section trop longue en gardant la cohérence
 */
function splitLongSection(section, maxSize, overlap) {
  const chunks = [];
  const sentences = section.split(/[.!?]+/).filter(s => s.trim().length > 10);
  
  let currentChunk = '';
  for (const sentence of sentences) {
    const potentialChunk = currentChunk + sentence.trim() + '. ';
    
    if (potentialChunk.length > maxSize && currentChunk.length > 100) {
      chunks.push({
        content: currentChunk.trim(),
        priority: calculateSectionPriority(currentChunk, '')
      });
      currentChunk = sentence.trim() + '. ';
    } else {
      currentChunk = potentialChunk;
    }
  }
  
  if (currentChunk.trim().length > 50) {
    chunks.push({
      content: currentChunk.trim(),
      priority: calculateSectionPriority(currentChunk, '')
    });
  }
  
  return chunks;
}

/**
 * Calcule la priorité d'une section (pour la déduplication)
 */
function calculateSectionPriority(content, title) {
  let priority = 0;
  
  // Bonus si contient des mots du titre
  const titleWords = title.toLowerCase().split(/\s+/);
  const contentLower = content.toLowerCase();
  const titleMatches = titleWords.filter(word => word.length > 3 && contentLower.includes(word)).length;
  priority += titleMatches * 10;
  
  // Bonus pour les mots-clés importants
  const importantKeywords = [
    'exercice', 'protocole', 'technique', 'méthode', 'traitement',
    'rééducation', 'mobilisation', 'renforcement', 'étirement',
    'objectif', 'indication', 'contre-indication', 'précaution'
  ];
  
  const keywordMatches = importantKeywords.filter(keyword => 
    contentLower.includes(keyword)).length;
  priority += keywordMatches * 5;
  
  // Bonus pour les sections structurées
  if (/\d+\.\s/.test(content)) priority += 10; // Listes numérotées
  if (/[-•]\s/.test(content)) priority += 5; // Listes à puces
  
  return priority;
}

/**
 * DÉDUPLICATION des chunks similaires
 */
async function deduplicateChunks(chunks) {
  console.log('🔄 Déduplication en cours...');
  
  if (chunks.length <= 1) return chunks;
  
  const uniqueChunks = [];
  const SIMILARITY_THRESHOLD = 0.85; // 85% de similarité = doublon
  
  for (const chunk of chunks) {
    let isDuplicate = false;
    
    for (const existingChunk of uniqueChunks) {
      const similarity = calculateTextSimilarity(chunk.content, existingChunk.content);
      
      if (similarity > SIMILARITY_THRESHOLD) {
        isDuplicate = true;
        // Garder le chunk avec la meilleure priorité
        if (chunk.priority > existingChunk.priority) {
          const index = uniqueChunks.indexOf(existingChunk);
          uniqueChunks[index] = chunk;
        }
        break;
      }
    }
    
    if (!isDuplicate) {
      uniqueChunks.push(chunk);
    }
  }
  
  console.log(`🔄 ${chunks.length - uniqueChunks.length} doublons supprimés`);
  return uniqueChunks;
}

/**
 * Calcule la similarité entre deux textes (algorithme Jaccard simplifié)
 */
function calculateTextSimilarity(text1, text2) {
  const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * COMPRESSION des métadonnées
 */
function compressMetadata(metadata) {
  const compressed = {};
  
  // Mappings pour compression
  const keyMappings = {
    'filename': 'f',
    'size': 's',
    'uploadedAt': 'u',
    'pages': 'p',
    'chunkIndex': 'ci',
    'totalChunks': 'tc',
    'originalLength': 'ol',
    'cleanedLength': 'cl',
    'type': 't'
  };
  
  const valueMappings = {
    'pdf_chunk': 'pc',
    'pdf_single': 'ps'
  };
  
  for (const [key, value] of Object.entries(metadata)) {
    const compressedKey = keyMappings[key] || key;
    const compressedValue = valueMappings[value] || value;
    
    // Tronquer les chaînes trop longues
    if (typeof compressedValue === 'string' && compressedValue.length > 100) {
      compressed[compressedKey] = compressedValue.substring(0, 100);
    } else {
      compressed[compressedKey] = compressedValue;
    }
  }
  
  return compressed;
}

/**
 * Calcule les économies d'espace réalisées
 */
function calculateSpaceSavings(originalSize, results) {
  const totalStoredSize = results.reduce((sum, result) => {
    const contentSize = result.content ? result.content.length : 0;
    const metadataSize = JSON.stringify(result.metadata || {}).length;
    return sum + contentSize + metadataSize;
  }, 0);
  
  return ((originalSize - totalStoredSize) / originalSize * 100).toFixed(1);
}

/**
 * Obtient des informations sur un PDF sans le traiter complètement
 */
async function getPDFInfo(buffer) {
  try {
    validatePDF(buffer);
    
    const data = await pdf(buffer);
    const cleanText = advancedCleanText(data.text);
    const estimatedChunks = intelligentChunking(cleanText, 'test').length;
    
    return {
      pages: data.numpages,
      originalTextLength: data.text.length,
      cleanedTextLength: cleanText.length,
      spaceSavings: ((data.text.length - cleanText.length) / data.text.length * 100).toFixed(1) + '%',
      estimatedChunks: estimatedChunks,
      hasText: cleanText.length > 100,
      preview: cleanText.substring(0, 200) + '...',
      optimizationRecommendation: getOptimizationRecommendation(data.text.length, estimatedChunks)
    };
    
  } catch (error) {
    throw new Error(`Erreur analyse PDF: ${error.message}`);
  }
}

/**
 * Recommandations d'optimisation
 */
function getOptimizationRecommendation(originalSize, estimatedChunks) {
  if (originalSize < 5000) {
    return 'Document court - optimisation standard';
  } else if (originalSize < 20000) {
    return 'Document moyen - optimisation recommandée';
  } else if (estimatedChunks > 10) {
    return 'Document long - optimisation forte recommandée';
  } else {
    return 'Document volumineux - optimisation maximale appliquée';
  }
}

/**
 * Valide qu'un buffer est bien un PDF
 */
function validatePDF(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Buffer PDF vide');
  }
  
  const header = buffer.toString('ascii', 0, 4);
  if (header !== '%PDF') {
    throw new Error('Le fichier n\'est pas un PDF valide');
  }
  
  return true;
}

/**
 * Nettoyage simple pour compatibilité
 */
function cleanPDFText(text) {
  return advancedCleanText(text);
}

module.exports = {
  processPDF,
  validatePDF,
  getPDFInfo,
  cleanPDFText,
  // Nouvelles fonctions optimisées
  advancedCleanText,
  intelligentChunking,
  deduplicateChunks,
  compressMetadata,
  calculateSpaceSavings
};