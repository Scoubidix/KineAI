import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase/config';

/**
 * Service RGPD pour la gestion des données utilisateur
 */
class RGPDService {
  constructor() {
    this.baseURL = process.env.NEXT_PUBLIC_API_URL;
  }

  /**
   * Obtient le token Firebase de l'utilisateur connecté
   * @returns {Promise<string>} Token d'authentification
   */
  async getAuthToken() {
    const auth = getAuth(app);
    const user = auth.currentUser;
    
    if (!user) {
      throw new Error('Utilisateur non connecté');
    }
    
    return await user.getIdToken();
  }

  /**
   * Génère un export des données utilisateur
   * @returns {Promise<{success: boolean, token?: string, downloadUrl?: string, expiresAt?: string, error?: string}>}
   */
  async generateDataExport() {
    try {
      const token = await this.getAuthToken();
      
      const response = await fetch(`${this.baseURL}/api/rgpd/export-data`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de la génération de l\'export');
      }

      return {
        success: true,
        token: data.token,
        downloadUrl: `${this.baseURL}${data.downloadUrl}`,
        expiresAt: data.expiresAt,
        validUntil: data.validUntil,
        dataSize: data.dataSize,
        instructions: data.instructions
      };

    } catch (error) {
      console.error('Erreur génération export RGPD:', error);
      return {
        success: false,
        error: error.message || 'Erreur lors de la génération de l\'export'
      };
    }
  }

  /**
   * Télécharge directement le fichier d'export
   * @param {string} downloadUrl - URL de téléchargement
   * @param {string} filename - Nom du fichier (optionnel)
   */
  async downloadExport(downloadUrl, filename = 'export_rgpd.zip') {
    try {
      // Créer un lien temporaire pour déclencher le téléchargement
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      link.style.display = 'none';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      return { success: true };
      
    } catch (error) {
      console.error('Erreur téléchargement export:', error);
      return {
        success: false,
        error: 'Erreur lors du téléchargement'
      };
    }
  }

  /**
   * Supprime définitivement le compte utilisateur (nouvelle version sans exportToken)
   * @param {Object} params - Paramètres de suppression
   * @param {string} params.confirmationText - Texte de confirmation ('SUPPRIMER')
   * @param {boolean} params.understands7DaysDelay - Confirmation de la période de grâce
   * @param {boolean} params.agreesToDataLoss - Accord pour la perte de données
   * @returns {Promise<{success: boolean, message?: string, details?: Object, error?: string}>}
   */
  async deleteAccount({ confirmationText, understands7DaysDelay, agreesToDataLoss }) {
    try {
      const token = await this.getAuthToken();
      
      const response = await fetch(`${this.baseURL}/api/rgpd/delete-account`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          confirmationText,
          understands7DaysDelay,
          agreesToDataLoss
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.error,
          code: data.code,
          planType: data.planType
        };
      }

      return {
        success: true,
        message: data.message,
        details: data.details,
        nextSteps: data.nextSteps
      };

    } catch (error) {
      console.error('Erreur suppression compte:', error);
      return {
        success: false,
        error: error.message || 'Erreur lors de la suppression du compte'
      };
    }
  }

  /**
   * Vérifie l'éligibilité complète pour la suppression de compte (nouvelle API)
   * @returns {Promise<{canDelete: boolean, planType: string, hasRecentExport: boolean, lastExport?: Object, reason?: string}>}
   */
  async checkDeletionEligibility() {
    try {
      const token = await this.getAuthToken();
      
      // Utiliser la nouvelle API d'éligibilité RGPD
      const response = await fetch(`${this.baseURL}/api/rgpd/eligibility`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Erreur lors de la vérification d\'éligibilité');
      }

      const data = await response.json();

      return {
        canDelete: data.canDelete,
        planType: data.planType,
        hasRecentExport: data.hasRecentExport,
        lastExport: data.lastExport,
        validUntil: data.validUntil,
        reason: data.reason,
        checkedAt: data.checkedAt
      };

    } catch (error) {
      console.error('Erreur vérification éligibilité:', error);
      return {
        canDelete: false,
        planType: 'UNKNOWN',
        hasRecentExport: false,
        reason: error.message || 'Impossible de vérifier votre éligibilité'
      };
    }
  }

  /**
   * Formate la taille des données en format lisible
   * @param {number} bytes - Taille en bytes
   * @returns {string} Taille formatée
   */
  formatDataSize(bytes) {
    if (!bytes) return '0 B';
    
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Formate une date d'expiration en format lisible
   * @param {string} dateString - Date ISO string
   * @returns {string} Date formatée
   */
  formatExpiryDate(dateString) {
    if (!dateString) return 'Date inconnue';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = Math.ceil((date - now) / (1000 * 60 * 60));
    
    const formattedDate = date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    if (diffHours > 0) {
      return `${formattedDate} (expire dans ${diffHours}h)`;
    } else {
      return `${formattedDate} (expiré)`;
    }
  }

  /**
   * Valide le texte de confirmation pour la suppression
   * @param {string} text - Texte saisi par l'utilisateur
   * @returns {boolean} True si valide
   */
  validateConfirmationText(text) {
    return text === 'SUPPRIMER';
  }

  /**
   * Génère un nom de fichier d'export personnalisé
   * @param {string} firstName - Prénom
   * @param {string} lastName - Nom
   * @returns {string} Nom de fichier
   */
  generateExportFilename(firstName, lastName) {
    const date = new Date().toISOString().split('T')[0];
    const cleanFirstName = (firstName || '').replace(/[^a-zA-Z0-9]/g, '');
    const cleanLastName = (lastName || '').replace(/[^a-zA-Z0-9]/g, '');
    
    return `export_rgpd_${cleanFirstName}_${cleanLastName}_${date}.zip`;
  }
}

// Instance singleton
const rgpdService = new RGPDService();

export default rgpdService;