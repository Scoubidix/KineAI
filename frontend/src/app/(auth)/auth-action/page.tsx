"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Check, X, RefreshCw } from "lucide-react";
import {
  verifyResetCode,
  confirmNewPassword,
  verifyEmailCode,
  resendEmailVerification
} from "@/lib/auth-utils";
import { auth } from "@/lib/firebase/config";

// Composant Reset Password
function ResetPasswordComponent({ oobCode }: { oobCode: string }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [resetComplete, setResetComplete] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();
  const { toast } = useToast();

  const validatePasswordStrength = (password: string) => {
    const minLength = password.length >= 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    return {
      minLength,
      hasUpperCase,
      hasLowerCase,
      hasNumbers,
      hasSpecialChar,
      isValid: minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar,
      passwordsMatch: confirmPassword ? password === confirmPassword : true,
    };
  };

  const passwordValidation = validatePasswordStrength(newPassword);

  useEffect(() => {
    const verifyCode = async () => {
      try {
        const result = await verifyResetCode(oobCode);
        if (result.success && result.email) {
          setUserEmail(result.email);
        } else {
          setError(result.error || "Code de réinitialisation invalide.");
        }
      } catch {
        setError("Erreur lors de la vérification du code.");
      }
    };

    if (oobCode) {
      verifyCode();
    } else {
      setError("Code de réinitialisation manquant.");
    }
  }, [oobCode]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!passwordValidation.isValid) {
        toast({ variant: "destructive", title: "Mot de passe invalide", description: "Le mot de passe ne respecte pas les critères de sécurité." });
        return;
      }

      if (newPassword !== confirmPassword) {
        toast({ variant: "destructive", title: "Erreur", description: "Les mots de passe ne correspondent pas." });
        return;
      }

      const result = await confirmNewPassword(oobCode, newPassword);

      if (result.success) {
        setResetComplete(true);
        setTimeout(() => { router.push('/login'); }, 3000);
      } else {
        toast({ variant: "destructive", title: "Erreur", description: result.error });
      }
    } catch {
      toast({ variant: "destructive", title: "Erreur", description: "Une erreur s'est produite. Veuillez réessayer." });
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-6">
        <p className="text-center text-xl font-bold text-red-600">Lien invalide</p>
        <p className="text-center text-sm text-gray-500">{error}</p>
        <div className="space-y-3">
          <Link href="/forgot-password" className="btn-teal block w-full h-11 leading-[2.75rem] rounded-lg text-sm font-medium text-center">
            Demander un nouveau lien
          </Link>
          <Link href="/login" className="inline-block w-full h-11 leading-[2.75rem] rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 text-center">
            Retour à la connexion
          </Link>
        </div>
      </div>
    );
  }

  if (resetComplete) {
    return (
      <div className="space-y-6">
        <p className="text-center text-xl font-bold text-green-600">Mot de passe modifié !</p>
        <p className="text-center text-sm text-gray-500">Vous allez être redirigé vers la connexion...</p>
        <Link href="/login" className="btn-teal block w-full h-11 leading-[2.75rem] rounded-lg text-sm font-medium text-center">
          Se connecter maintenant
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-center text-xl font-bold text-gray-900">Nouveau mot de passe</p>
      <p className="text-center text-sm text-gray-500">Pour {userEmail}</p>

      <form onSubmit={handleResetPassword} className="space-y-5">
        {/* Nouveau mot de passe */}
        <div className="space-y-1">
          <label htmlFor="newPassword" className="text-sm font-medium text-gray-700">Nouveau mot de passe</label>
          <div className="relative">
            <input
              id="newPassword"
              type={showNewPassword ? "text" : "password"}
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full h-11 px-3 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              required
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowNewPassword(!showNewPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              disabled={loading}
            >
              {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Confirmer mot de passe */}
        <div className="space-y-1">
          <label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">Confirmer le mot de passe</label>
          <div className="relative">
            <input
              id="confirmPassword"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full h-11 px-3 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              required
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              disabled={loading}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Critères mot de passe */}
        {newPassword && (
          <div className="p-3 bg-gray-50 rounded-lg space-y-1">
            <p className="text-xs font-medium text-gray-500 mb-1">Critères de sécurité :</p>
            {[
              { ok: passwordValidation.minLength, label: "Au moins 8 caractères" },
              { ok: passwordValidation.hasUpperCase, label: "Une majuscule (A-Z)" },
              { ok: passwordValidation.hasLowerCase, label: "Une minuscule (a-z)" },
              { ok: passwordValidation.hasNumbers, label: "Un chiffre (0-9)" },
              { ok: passwordValidation.hasSpecialChar, label: "Un caractère spécial" },
              ...(confirmPassword ? [{ ok: passwordValidation.passwordsMatch, label: "Les mots de passe correspondent" }] : []),
            ].map((rule) => (
              <div key={rule.label} className={`flex items-center gap-2 text-xs ${rule.ok ? "text-green-600" : "text-red-500"}`}>
                {rule.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                <span>{rule.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Bouton */}
        <button
          type="submit"
          disabled={loading || !passwordValidation.isValid || newPassword !== confirmPassword}
          className="btn-teal w-full h-11 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Modification en cours...
            </div>
          ) : (
            "Modifier le mot de passe"
          )}
        </button>
      </form>

      <Link href="/login" className="inline-block w-full h-11 leading-[2.75rem] rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 text-center">
        Retour à la connexion
      </Link>
    </div>
  );
}

// Composant Vérification Email
function VerifyEmailComponent({ oobCode }: { oobCode: string }) {
  const [loading, setLoading] = useState(true);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [error, setError] = useState("");
  const [resendLoading, setResendLoading] = useState(false);

  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    const verifyEmail = async () => {
      try {
        if (!oobCode) {
          setError("Code de vérification manquant.");
          setLoading(false);
          return;
        }

        const result = await verifyEmailCode(oobCode);

        if (result.success) {
          setVerificationComplete(true);
          if (auth.currentUser) {
            await auth.currentUser.reload();
          }
          setTimeout(() => { router.push('/dashboard/kine/home'); }, 2000);
        } else {
          setError(result.error || "Code de vérification invalide.");
        }
      } catch {
        setError("Erreur lors de la vérification de l'email.");
      } finally {
        setLoading(false);
      }
    };

    verifyEmail();
  }, [oobCode, router, toast]);

  const handleResendVerification = async () => {
    setResendLoading(true);
    try {
      const result = await resendEmailVerification();
      if (result.success) {
        toast({ title: "Email renvoyé", description: "Un nouvel email de vérification a été envoyé." });
      } else {
        toast({ variant: "destructive", title: "Erreur", description: result.error });
      }
    } catch {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible de renvoyer l'email." });
    } finally {
      setResendLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-2 border-teal-300 border-t-teal-600 rounded-full animate-spin mx-auto" />
        <p className="text-sm text-gray-500">Vérification de votre email...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <p className="text-center text-xl font-bold text-red-600">Vérification échouée</p>
        <p className="text-center text-sm text-gray-500">{error}</p>
        <div className="space-y-3">
          <button
            onClick={handleResendVerification}
            disabled={resendLoading}
            className="btn-teal w-full h-11 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {resendLoading ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Renvoi en cours...
              </span>
            ) : (
              "Renvoyer l'email de vérification"
            )}
          </button>
          <Link href="/login" className="inline-block w-full h-11 leading-[2.75rem] rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 text-center">
            Retour à la connexion
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-center text-xl font-bold text-green-600">Email vérifié !</p>
      <p className="text-center text-sm text-gray-500">Votre compte est maintenant actif. Redirection en cours...</p>
      <Link href="/dashboard/kine/home" className="btn-teal block w-full h-11 leading-[2.75rem] rounded-lg text-sm font-medium text-center">
        Aller au dashboard
      </Link>
    </div>
  );
}

// Composant Action Invalide
function InvalidActionComponent() {
  return (
    <div className="space-y-6">
      <p className="text-center text-xl font-bold text-red-600">Action non reconnue</p>
      <p className="text-center text-sm text-gray-500">Ce lien n'est pas reconnu ou a expiré.</p>
      <div className="space-y-3">
        <Link href="/login" className="btn-teal block w-full h-11 leading-[2.75rem] rounded-lg text-sm font-medium text-center">
          Aller à la connexion
        </Link>
        <Link href="/forgot-password" className="inline-block w-full h-11 leading-[2.75rem] rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 text-center">
          Mot de passe oublié
        </Link>
      </div>
    </div>
  );
}

// Composant principal qui route selon le mode
function AuthActionForm() {
  const searchParams = useSearchParams();
  const mode = searchParams.get('mode') as 'resetPassword' | 'verifyEmail' | 'verifyAndChangeEmail' | 'recoverEmail' | null;
  const oobCode = searchParams.get('oobCode') || '';

  switch (mode) {
    case 'resetPassword':
      return <ResetPasswordComponent oobCode={oobCode} />;
    case 'verifyEmail':
      return <VerifyEmailComponent oobCode={oobCode} />;
    default:
      return <InvalidActionComponent />;
  }
}

// Page principale
export default function AuthActionPage() {
  return (
    <div className="min-h-screen bg-white flex justify-center pt-20 p-4">
      <div className="w-full max-w-sm space-y-8">

        {/* Logo */}
        <div className="flex justify-center">
          <Image src="/logo.png" alt="Mon Assistant Kiné" width={100} height={100} className="rounded-xl" priority />
        </div>

        {/* Titre */}
        <h1 className="text-2xl font-bold text-center" style={{ color: '#1f5c6a' }}>
          Mon Assistant Kiné
        </h1>

        {/* Contenu dynamique */}
        <Suspense fallback={
          <div className="text-center space-y-4">
            <div className="w-8 h-8 border-2 border-teal-300 border-t-teal-600 rounded-full animate-spin mx-auto" />
            <p className="text-sm text-gray-500">Chargement...</p>
          </div>
        }>
          <AuthActionForm />
        </Suspense>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 space-y-1">
          <p>&copy; {new Date().getFullYear()} Mon Assistant Kiné</p>
          <p>
            <a href="/legal/cgu.html" target="_blank" rel="noopener noreferrer" className="hover:underline">CGU</a>
            {" • "}
            <a href="/legal/politique-confidentialite.html" target="_blank" rel="noopener noreferrer" className="hover:underline">Politique de confidentialité</a>
            {" • "}
            <a href="/legal/mentions-legales.html" target="_blank" rel="noopener noreferrer" className="hover:underline">Mentions légales</a>
          </p>
        </div>

      </div>
    </div>
  );
}
