// utils/logger.js
// Système de logging centralisé pour KineAI
// Adapte l'affichage des logs selon l'environnement (development/production)

const isDevelopment = process.env.NODE_ENV === 'development';

const logger = {
  /**
   * Log général - Affiché uniquement en développement
   * Utilisation : Informations générales, suivi du flux
   */
  log: (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },
  
  /**
   * Informations importantes - Affiché uniquement en développement
   * Utilisation : Opérations réussies, confirmations
   */
  info: (...args) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },
  
  /**
   * Avertissements - Affiché en développement ET en production
   * Utilisation : Situations anormales non critiques, alertes préventives
   */
  warn: (...args) => {
    console.warn(...args);
  },
  
  /**
   * Erreurs - Affiché en développement ET en production
   * Utilisation : Erreurs fonctionnelles, bugs, pannes
   */
  error: (...args) => {
    console.error(...args);
  },
  
  /**
   * Debug - Affiché uniquement en développement
   * Utilisation : Informations de débogage détaillées
   */
  debug: (...args) => {
    if (isDevelopment) {
      console.log('🔍 DEBUG:', ...args);
    }
  }
};

module.exports = logger;