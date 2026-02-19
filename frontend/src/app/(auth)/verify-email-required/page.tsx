"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { RefreshCw } from "lucide-react";
import { resendEmailVerification } from "@/lib/auth-utils";
import { getAuth, signOut } from "firebase/auth";
import { app } from "@/lib/firebase/config";

export default function VerifyEmailRequiredPage() {
  const [resendLoading, setResendLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [checkingStatus, setCheckingStatus] = useState(false);

  const router = useRouter();
  const { toast } = useToast();
  const auth = getAuth(app);

  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      setUserEmail(user.email || "");
    } else {
      router.replace('/login');
    }
  }, [auth.currentUser, router]);

  useEffect(() => {
    const checkEmailVerification = async () => {
      const user = auth.currentUser;
      if (user) {
        await user.reload();
        if (user.emailVerified) {
          toast({ title: "Email vérifié !", description: "Votre compte est maintenant actif." });
          router.push('/dashboard/kine/home');
        }
      }
    };
    const interval = setInterval(checkEmailVerification, 5000);
    return () => clearInterval(interval);
  }, [auth.currentUser, router, toast]);

  const handleResendEmail = async () => {
    setResendLoading(true);
    try {
      const result = await resendEmailVerification();
      if (result.success) {
        setEmailSent(true);
        toast({ title: "Email renvoyé", description: "Un nouvel email de vérification a été envoyé." });
      } else {
        toast({ variant: "destructive", title: "Erreur", description: result.error || "Impossible de renvoyer l'email." });
      }
    } catch {
      toast({ variant: "destructive", title: "Erreur", description: "Une erreur inattendue s'est produite." });
    } finally {
      setResendLoading(false);
    }
  };

  const handleCheckNow = async () => {
    setCheckingStatus(true);
    try {
      const user = auth.currentUser;
      if (user) {
        await user.reload();
        if (user.emailVerified) {
          toast({ title: "Email vérifié !", description: "Redirection vers votre dashboard..." });
          router.push('/dashboard/kine/home');
        } else {
          toast({ variant: "destructive", title: "Email non vérifié", description: "Vérifiez votre boîte de réception." });
        }
      }
    } catch {
      toast({ variant: "destructive", title: "Erreur", description: "Impossible de vérifier le statut." });
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.replace('/login');
    } catch {
      toast({ variant: "destructive", title: "Erreur", description: "Erreur lors de la déconnexion." });
    }
  };

  return (
    <div className="min-h-screen bg-white flex justify-center pt-16 p-4">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo */}
        <div className="flex justify-center">
          <Image src="/logo.png" alt="Mon Assistant Kiné" width={100} height={100} className="rounded-xl" priority />
        </div>

        {/* Titre */}
        <h1 className="text-2xl font-bold text-center" style={{ color: '#1f5c6a' }}>
          Mon Assistant Kiné
        </h1>

        {/* Email envoyé à */}
        <div className="text-center space-y-2">
          <p className="text-sm text-gray-500">Un email de vérification a été envoyé à :</p>
          <p className="font-medium text-gray-900 break-all">{userEmail}</p>
        </div>

        {/* Instructions */}
        <div className="bg-gray-50 p-4 rounded-lg space-y-2">
          <ul className="text-sm text-gray-600 space-y-1">
            <li>1. Vérifiez votre boîte de réception</li>
            <li>2. Consultez aussi vos <strong>spams/indésirables</strong></li>
            <li>3. Cliquez sur le lien dans l'email</li>
            <li>4. Revenez ici, la page se met à jour automatiquement</li>
          </ul>
        </div>

        {/* Vérification auto */}
        <div className="flex items-center justify-center gap-2 text-sm text-gray-400">
          <div className="w-3 h-3 border border-teal-300 border-t-teal-600 rounded-full animate-spin" />
          <span>Vérification automatique en cours...</span>
        </div>

        {/* Boutons */}
        <div className="space-y-3">
          {/* J'ai vérifié */}
          <button
            onClick={handleCheckNow}
            disabled={checkingStatus}
            className="btn-teal w-full h-11 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {checkingStatus ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Vérification...
              </span>
            ) : (
              "J'ai vérifié mon email"
            )}
          </button>

          {/* Renvoyer */}
          <button
            onClick={handleResendEmail}
            disabled={resendLoading}
            className="w-full h-11 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {resendLoading ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                Envoi en cours...
              </span>
            ) : (
              emailSent ? "Renvoyer l'email" : "Renvoyer l'email de vérification"
            )}
          </button>

          {/* Confirmation envoi */}
          {emailSent && (
            <p className="text-sm text-green-600 text-center">
              Email renvoyé ! Vérifiez votre boîte de réception.
            </p>
          )}
        </div>

        {/* Déconnexion */}
        <div className="border-t border-gray-200 pt-4">
          <button
            onClick={handleLogout}
            className="w-full h-11 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Se déconnecter
          </button>
        </div>

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
