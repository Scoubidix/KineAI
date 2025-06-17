// services/pdfProcessor.js
const pdf = require('pdf-parse');
const { storeDocument, splitTextIntoChunks } = require('./embeddingService');

/**
 * Traite un buffer PDF et l'ajoute à la base vectorielle
 */
async function processPDF(buffer, title, category, metadata = {}) {
  try {
    console.log('🔄 Traitement PDF:', title);
    
    // Extraire le texte du PDF
    const data = await pdf(buffer);
    const fullText = data.text;
    
    console.log('📄 Texte extrait:', fullText.length, 'caractères');
    console.log('📖 Pages:', data.numpages);
    
    // Nettoyer le texte
    const cleanText = cleanPDFText(fullText);
    
    // Si le texte est trop long, le découper en chunks
    if (cleanText.length > 2000) {
      return await processLongDocument(cleanText, title, category, metadata);
    } else {
      // Document court : stocker tel quel
      return await storeDocument(title, cleanText, category, {
        ...metadata,
        pages: data.numpages,
        originalLength: fullText.length,
        type: 'pdf_single'
      });
    }
    
  } catch (error) {
    console.error('❌ Erreur traitement PDF:', error);
    throw new Error(`Erreur traitement PDF: ${error.message}`);
  }
}

/**
 * Traite un document long en le découpant en chunks
 */
async function processLongDocument(text, title, category, metadata = {}) {
  try {
    console.log('📚 Document long détecté, découpage en chunks...');
    
    const chunks = splitTextIntoChunks(text, 1500, 200);
    console.log('✂️ Créé', chunks.length, 'chunks');
    
    const results = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunkTitle = `${title} - Partie ${i + 1}/${chunks.length}`;
      const chunkMetadata = {
        ...metadata,
        chunkIndex: i,
        totalChunks: chunks.length,
        originalTitle: title,
        type: 'pdf_chunk'
      };
      
      console.log(`🔄 Stockage chunk ${i + 1}/${chunks.length}`);
      
      const result = await storeDocument(
        chunkTitle,
        chunks[i],
        category,
        chunkMetadata
      );
      
      results.push(result);
    }
    
    console.log('✅ Document stocké en', results.length, 'chunks');
    return results;
    
  } catch (error) {
    console.error('❌ Erreur traitement document long:', error);
    throw error;
  }
}

/**
 * Nettoie le texte extrait du PDF
 */
function cleanPDFText(text) {
  return text
    // Supprimer les sauts de ligne multiples
    .replace(/\n{3,}/g, '\n\n')
    // Supprimer les espaces multiples
    .replace(/\s{3,}/g, ' ')
    // Supprimer les caractères de contrôle
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Nettoyer les espaces en début/fin
    .trim();
}

/**
 * Valide qu'un buffer est bien un PDF
 */
function validatePDF(buffer) {
  if (!buffer || buffer.length === 0) {
    throw new Error('Buffer PDF vide');
  }
  
  // Vérifier la signature PDF
  const header = buffer.toString('ascii', 0, 4);
  if (header !== '%PDF') {
    throw new Error('Le fichier n\'est pas un PDF valide');
  }
  
  return true;
}

/**
 * Obtient des informations sur un PDF sans le traiter complètement
 */
async function getPDFInfo(buffer) {
  try {
    validatePDF(buffer);
    
    const data = await pdf(buffer);
    
    return {
      pages: data.numpages,
      textLength: data.text.length,
      hasText: data.text.length > 100, // Au moins 100 caractères
      preview: data.text.substring(0, 200) + '...'
    };
    
  } catch (error) {
    throw new Error(`Erreur analyse PDF: ${error.message}`);
  }
}

module.exports = {
  processPDF,
  validatePDF,
  getPDFInfo,
  cleanPDFText
};