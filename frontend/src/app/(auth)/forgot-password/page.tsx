"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { sendPasswordReset, validateEmail } from "@/lib/auth-utils";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  const handleSendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const emailValidation = validateEmail(email);
      if (!emailValidation.success) {
        toast({ variant: "destructive", title: "Email invalide", description: emailValidation.error });
        return;
      }

      const result = await sendPasswordReset(email);

      if (result.success) {
        setEmailSent(true);
        toast({ title: "Email envoyé", description: result.message });
      } else {
        toast({ variant: "destructive", title: "Erreur", description: result.error });
      }
    } catch {
      toast({ variant: "destructive", title: "Erreur inattendue", description: "Une erreur s'est produite. Veuillez réessayer." });
    } finally {
      setLoading(false);
    }
  };

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

        {!emailSent ? (
          <>
            <div>
              {/* Flèche retour */}
              <Link href="/login" className="inline-flex items-center text-black hover:text-gray-600">
                <ArrowLeft className="h-6 w-6" strokeWidth={3} />
              </Link>
              <p className="text-center text-2xl font-bold text-gray-900">
                Mot de passe oublié ?
              </p>
            </div>

            <form onSubmit={handleSendReset} className="space-y-5">

              {/* Email */}
              <div className="space-y-1">
                <label htmlFor="email" className="text-sm font-medium text-gray-700">Adresse email</label>
                <input
                  id="email"
                  type="email"
                  placeholder="votre@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                  required
                  disabled={loading}
                />
              </div>

              {/* Bouton envoi */}
              <button
                type="submit"
                disabled={loading}
                className="btn-teal w-full h-11 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Envoi en cours...
                  </div>
                ) : (
                  "Envoyer le lien de réinitialisation"
                )}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="text-center space-y-3">
              <p className="text-sm text-gray-600">
                Un email de réinitialisation a été envoyé à :
              </p>
              <p className="font-medium text-gray-900">{email}</p>
              <p className="text-sm text-gray-500">
                Cliquez sur le lien dans l'email pour créer un nouveau mot de passe.
                <br />
                <span className="text-xs">Le lien expire dans 1 heure.</span>
              </p>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => { setEmailSent(false); setEmail(""); }}
                className="w-full h-11 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Envoyer à une autre adresse
              </button>

              <Link
                href="/login"
                className="inline-block w-full h-11 leading-[2.75rem] rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 text-center"
              >
                Retour à la connexion
              </Link>
            </div>
          </>
        )}

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
