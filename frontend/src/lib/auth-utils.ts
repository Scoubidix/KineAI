import { 
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  verifyPasswordResetCode as firebaseVerifyPasswordResetCode,
  sendEmailVerification as firebaseSendEmailVerification,
  applyActionCode as firebaseApplyActionCode,
  AuthError,
  ActionCodeSettings,
  User
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
      return 'Le lien de vérification a expiré. Demandez un nouveau lien.';
    case 'auth/invalid-action-code':
      return 'Le lien de vérification est invalide ou a déjà été utilisé.';
    case 'auth/weak-password':
      return 'Le mot de passe doit contenir au moins 6 caractères.';
    case 'auth/network-request-failed':
      return 'Erreur de connexion. Vérifiez votre connexion internet.';
    case 'auth/user-disabled':
      return 'Ce compte utilisateur a été désactivé.';
    case 'auth/operation-not-allowed':
      return 'Cette opération n\'est pas autorisée.';
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

    // ✨ Configuration pour rediriger vers votre page auth-action
    const actionCodeSettings: ActionCodeSettings = {
      url: `${window.location.origin}/auth-action`,
      handleCodeInApp: true,
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

// ✅ 2. Vérifier la validité du code de réinitialisation
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

// ✅ 3. Confirmer le nouveau mot de passe
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

// ✅ 4. Envoyer un email de vérification (NOUVEAU)
export const sendEmailVerification = async (user?: User): Promise<AuthResponse> => {
  try {
    // Utiliser l'utilisateur passé en paramètre ou l'utilisateur actuel
    const currentUser = user || auth.currentUser;
    
    if (!currentUser) {
      return {
        success: false,
        error: 'Aucun utilisateur connecté pour envoyer la vérification.'
      };
    }

    // Si l'email est déjà vérifié
    if (currentUser.emailVerified) {
      return {
        success: true,
        message: 'Votre email est déjà vérifié.'
      };
    }

    // ✨ Configuration pour rediriger vers votre page auth-action
    const actionCodeSettings: ActionCodeSettings = {
      url: `${window.location.origin}/auth-action`,
      handleCodeInApp: true,
    };

    await firebaseSendEmailVerification(currentUser, actionCodeSettings);

    return {
      success: true,
      message: 'Un email de vérification a été envoyé à votre adresse.'
    };

  } catch (error) {
    console.error('Erreur lors de l\'envoi de l\'email de vérification:', error);
    
    const authError = error as AuthError;
    return {
      success: false,
      error: getErrorMessage(authError.code)
    };
  }
};

// ✅ 5. Vérifier le code d'email (NOUVEAU)
export const verifyEmailCode = async (oobCode: string): Promise<AuthResponse> => {
  try {
    if (!oobCode) {
      return {
        success: false,
        error: 'Code de vérification manquant.'
      };
    }

    // Appliquer le code de vérification d'email
    await firebaseApplyActionCode(auth, oobCode);

    // Actualiser l'utilisateur pour mettre à jour le statut emailVerified
    if (auth.currentUser) {
      await auth.currentUser.reload();
    }

    return {
      success: true,
      message: 'Votre email a été vérifié avec succès.'
    };

  } catch (error) {
    console.error('Erreur lors de la vérification de l\'email:', error);
    
    const authError = error as AuthError;
    return {
      success: false,
      error: getErrorMessage(authError.code)
    };
  }
};

// ✅ 6. Renvoyer un email de vérification (NOUVEAU)
export const resendEmailVerification = async (): Promise<AuthResponse> => {
  try {
    const currentUser = auth.currentUser;
    
    if (!currentUser) {
      return {
        success: false,
        error: 'Aucun utilisateur connecté.'
      };
    }

    // Si l'email est déjà vérifié
    if (currentUser.emailVerified) {
      return {
        success: true,
        message: 'Votre email est déjà vérifié.'
      };
    }

    // Renvoyer l'email de vérification
    return await sendEmailVerification(currentUser);

  } catch (error) {
    console.error('Erreur lors du renvoi de l\'email de vérification:', error);
    
    const authError = error as AuthError;
    return {
      success: false,
      error: getErrorMessage(authError.code)
    };
  }
};

// ✅ 7. Vérifier le statut de vérification d'email (NOUVEAU)
export const checkEmailVerificationStatus = (): { isVerified: boolean; email?: string } => {
  const currentUser = auth.currentUser;
  
  if (!currentUser) {
    return { isVerified: false };
  }

  return {
    isVerified: currentUser.emailVerified,
    email: currentUser.email || undefined
  };
};

// ✅ 8. Validation côté client du mot de passe
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

// ✅ 9. Validation de l'email
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