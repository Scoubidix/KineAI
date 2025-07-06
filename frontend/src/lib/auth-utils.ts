import { 
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  verifyPasswordResetCode as firebaseVerifyPasswordResetCode,
  AuthError,
  ActionCodeSettings
} from 'firebase/auth';
import { auth } from './firebase/config';

// ✅ Interface pour les réponses standardisées
interface AuthResponse {
  success: boolean;
  message?: string;
  error?: string;
}

// ✅ Messages d'erreur en français
const getErrorMessage = (errorCode: string): string => {
  switch (errorCode) {
    case 'auth/user-not-found':
      return 'Aucun compte trouvé avec cette adresse email.';
    case 'auth/invalid-email':
      return 'Adresse email invalide.';
    case 'auth/too-many-requests':
      return 'Trop de tentatives. Veuillez réessayer plus tard.';
    case 'auth/expired-action-code':
      return 'Le lien de réinitialisation a expiré. Demandez un nouveau lien.';
    case 'auth/invalid-action-code':
      return 'Le lien de réinitialisation est invalide ou a déjà été utilisé.';
    case 'auth/weak-password':
      return 'Le mot de passe doit contenir au moins 6 caractères.';
    case 'auth/network-request-failed':
      return 'Erreur de connexion. Vérifiez votre connexion internet.';
    default:
      return 'Une erreur inattendue s\'est produite. Veuillez réessayer.';
  }
};

// ✅ 1. Envoyer un email de réinitialisation
export const sendPasswordReset = async (email: string): Promise<AuthResponse> => {
  try {
    // Validation basique de l'email
    if (!email || !email.includes('@')) {
      return {
        success: false,
        error: 'Veuillez saisir une adresse email valide.'
      };
    }

    // ✨ Configuration pour rediriger vers votre page custom
    const actionCodeSettings: ActionCodeSettings = {
      url: `${window.location.origin}/reset-password`,
      handleCodeInApp: true, // Important : traiter dans votre app
    };

    await firebaseSendPasswordResetEmail(auth, email, actionCodeSettings);

    return {
      success: true,
      message: 'Un email de réinitialisation a été envoyé à votre adresse.'
    };

  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email de réinitialisation:', error);
    
    const authError = error as AuthError;
    return {
      success: false,
      error: getErrorMessage(authError.code)
    };
  }
};

// ✅ 2. Vérifier la validité du code de réinitialisation (inchangée)
export const verifyResetCode = async (code: string): Promise<AuthResponse & { email?: string }> => {
  try {
    if (!code) {
      return {
        success: false,
        error: 'Code de réinitialisation manquant.'
      };
    }

    // Vérifier le code et récupérer l'email associé
    const email = await firebaseVerifyPasswordResetCode(auth, code);

    return {
      success: true,
      email: email,
      message: 'Code de réinitialisation valide.'
    };

  } catch (error) {
    console.error('Erreur lors de la vérification du code:', error);
    
    const authError = error as AuthError;
    return {
      success: false,
      error: getErrorMessage(authError.code)
    };
  }
};

// ✅ 3. Confirmer le nouveau mot de passe (inchangée)
export const confirmNewPassword = async (code: string, newPassword: string): Promise<AuthResponse> => {
  try {
    // Validations
    if (!code) {
      return {
        success: false,
        error: 'Code de réinitialisation manquant.'
      };
    }

    if (!newPassword || newPassword.length < 6) {
      return {
        success: false,
        error: 'Le mot de passe doit contenir au moins 6 caractères.'
      };
    }

    // Confirmer la réinitialisation du mot de passe
    await firebaseConfirmPasswordReset(auth, code, newPassword);

    return {
      success: true,
      message: 'Votre mot de passe a été modifié avec succès.'
    };

  } catch (error) {
    console.error('Erreur lors de la confirmation du nouveau mot de passe:', error);
    
    const authError = error as AuthError;
    return {
      success: false,
      error: getErrorMessage(authError.code)
    };
  }
};

// ✅ 4. Validation côté client du mot de passe (inchangée)
export const validatePassword = (password: string, confirmPassword?: string): AuthResponse => {
  if (!password) {
    return {
      success: false,
      error: 'Le mot de passe est requis.'
    };
  }

  if (password.length < 6) {
    return {
      success: false,
      error: 'Le mot de passe doit contenir au moins 6 caractères.'
    };
  }

  // Validation optionnelle de complexité
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);

  if (!hasUpperCase || !hasLowerCase || !hasNumbers) {
    return {
      success: false,
      error: 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre.'
    };
  }

  // Vérification de la confirmation si fournie
  if (confirmPassword !== undefined && password !== confirmPassword) {
    return {
      success: false,
      error: 'Les mots de passe ne correspondent pas.'
    };
  }

  return {
    success: true,
    message: 'Mot de passe valide.'
  };
};

// ✅ 5. Validation de l'email (inchangée)
export const validateEmail = (email: string): AuthResponse => {
  if (!email) {
    return {
      success: false,
      error: 'L\'adresse email est requise.'
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      success: false,
      error: 'Veuillez saisir une adresse email valide.'
    };
  }

  return {
    success: true,
    message: 'Adresse email valide.'
  };
};