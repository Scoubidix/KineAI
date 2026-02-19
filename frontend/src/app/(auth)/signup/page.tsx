"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase/config";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Check, X, RefreshCw } from "lucide-react";
import { sendEmailVerification } from "@/lib/auth-utils";

export default function SignupPage() {
  const [formData, setFormData] = useState({
    lastName: "",
    firstName: "",
    email: "",
    password: "",
  });
  const [website, setWebsite] = useState("");

  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [signupComplete, setSignupComplete] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [acceptedCgu, setAcceptedCgu] = useState(false);
  const [acceptedPolitiqueConfidentialite, setAcceptedPolitiqueConfidentialite] = useState(false);

  const router = useRouter();
  const { toast } = useToast();

  const validatePassword = (password: string) => {
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
    };
  };

  const passwordValidation = validatePassword(formData.password);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleResendVerification = async () => {
    setResendLoading(true);
    try {
      const result = await sendEmailVerification();
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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { email, password, firstName, lastName } = formData;

    if (!passwordValidation.isValid) {
      toast({ variant: "destructive", title: "Mot de passe invalide", description: "Le mot de passe ne respecte pas les critères de sécurité." });
      setLoading(false);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const now = new Date().toISOString();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/kine`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
        body: JSON.stringify({
          uid: user.uid,
          firstName,
          lastName,
          email,
          website,
          acceptedCguAt: acceptedCgu ? now : null,
          acceptedPolitiqueConfidentialiteAt: acceptedPolitiqueConfidentialite ? now : null,
          cguVersion: acceptedCgu ? "2.0" : null,
          politiqueConfidentialiteVersion: acceptedPolitiqueConfidentialite ? "1.0" : null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erreur lors de la création du profil");
      }

      const emailResult = await sendEmailVerification(user);
      if (emailResult.success) {
        setEmailSent(true);
        toast({ title: "Compte créé avec succès !", description: `Bienvenue ${firstName}. Un email de vérification a été envoyé.` });
      } else {
        toast({ title: "Compte créé", description: `Bienvenue ${firstName}. Problème d'envoi de l'email de vérification.`, variant: "destructive" });
      }

      setSignupComplete(true);
    } catch (error) {
      const err = error as Error;
      let errorMessage = "Une erreur est survenue lors de la création du compte.";
      if (err.message.includes("email-already-in-use")) {
        errorMessage = "Un compte existe déjà avec cette adresse email.";
      }
      toast({ variant: "destructive", title: "Erreur d'inscription", description: errorMessage });
    } finally {
      setLoading(false);
    }
  };

  // Écran post-inscription
  if (signupComplete) {
    return (
      <div className="min-h-screen bg-white flex justify-center pt-20 p-4">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex justify-center">
            <Image src="/logo.png" alt="Mon Assistant Kiné" width={100} height={100} className="rounded-xl" priority />
          </div>

          <h1 className="text-2xl font-bold text-center" style={{ color: '#1f5c6a' }}>
            Compte créé avec succès !
          </h1>

          <div className="text-center space-y-3">
            <p className="text-sm text-gray-600">
              Un email de vérification a été envoyé à :
            </p>
            <p className="font-medium text-gray-900">{formData.email}</p>
            <p className="text-sm text-gray-500">
              Cliquez sur le lien dans l'email pour activer votre compte.
              <br />
              <span className="text-xs">Pensez à vérifier vos spams.</span>
            </p>
          </div>

          <div className="space-y-3">
            {emailSent && (
              <button
                onClick={handleResendVerification}
                disabled={resendLoading}
                className="w-full h-11 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
            )}

            <Link
              href="/login"
              className="btn-teal block w-full h-11 leading-[2.75rem] rounded-lg text-sm font-medium text-center"
            >
              Se connecter
            </Link>
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

  // Formulaire d'inscription
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

        <form onSubmit={handleSignup} className="space-y-5">

          {/* Honeypot - invisible pour les humains */}
          <div className="absolute left-[-9999px]" aria-hidden="true" tabIndex={-1}>
            <label htmlFor="website">Website</label>
            <input
              id="website"
              name="website"
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              autoComplete="off"
            />
          </div>

          {/* Nom */}
          <div className="space-y-1">
            <label htmlFor="lastName" className="text-sm font-medium text-gray-700">Nom</label>
            <input
              id="lastName"
              name="lastName"
              placeholder="Dupont"
              value={formData.lastName}
              onChange={handleChange}
              className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              required
              disabled={loading}
            />
          </div>

          {/* Prénom */}
          <div className="space-y-1">
            <label htmlFor="firstName" className="text-sm font-medium text-gray-700">Prénom</label>
            <input
              id="firstName"
              name="firstName"
              placeholder="Jean"
              value={formData.firstName}
              onChange={handleChange}
              className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              required
              disabled={loading}
            />
          </div>

          {/* Email */}
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium text-gray-700">Adresse email</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="votre@email.com"
              value={formData.email}
              onChange={handleChange}
              className="w-full h-11 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              required
              disabled={loading}
            />
          </div>

          {/* Mot de passe */}
          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium text-gray-700">Mot de passe</label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={formData.password}
                onChange={handleChange}
                className="w-full h-11 px-3 pr-10 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                disabled={loading}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Critères mot de passe */}
            {formData.password && (
              <div className="mt-2 p-3 bg-gray-50 rounded-lg space-y-1">
                <p className="text-xs font-medium text-gray-500 mb-1">Critères de sécurité :</p>
                {[
                  { ok: passwordValidation.minLength, label: "Au moins 8 caractères" },
                  { ok: passwordValidation.hasUpperCase, label: "Une majuscule (A-Z)" },
                  { ok: passwordValidation.hasLowerCase, label: "Une minuscule (a-z)" },
                  { ok: passwordValidation.hasNumbers, label: "Un chiffre (0-9)" },
                  { ok: passwordValidation.hasSpecialChar, label: "Un caractère spécial" },
                ].map((rule) => (
                  <div key={rule.label} className={`flex items-center gap-2 text-xs ${rule.ok ? "text-green-600" : "text-red-500"}`}>
                    {rule.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    <span>{rule.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CGU et Politique de confidentialité */}
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                id="acceptCgu"
                checked={acceptedCgu}
                onChange={(e) => setAcceptedCgu(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                required
                disabled={loading}
              />
              <label htmlFor="acceptCgu" className="text-sm text-gray-700 cursor-pointer">
                J'ai lu et j'accepte les{" "}
                <a href="/legal/cgu.html" target="_blank" rel="noopener noreferrer" className="text-teal-600 underline hover:text-teal-800">
                  Conditions Générales d'Utilisation (CGU)
                </a>
                <span className="text-red-500 ml-1">*</span>
              </label>
            </div>

            <div className="flex items-start space-x-3">
              <input
                type="checkbox"
                id="acceptPolitiqueConfidentialite"
                checked={acceptedPolitiqueConfidentialite}
                onChange={(e) => setAcceptedPolitiqueConfidentialite(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                required
                disabled={loading}
              />
              <label htmlFor="acceptPolitiqueConfidentialite" className="text-sm text-gray-700 cursor-pointer">
                J'ai lu et j'accepte la{" "}
                <a href="/legal/politique-confidentialite.html" target="_blank" rel="noopener noreferrer" className="text-teal-600 underline hover:text-teal-800">
                  Politique de Confidentialité
                </a>
                <span className="text-red-500 ml-1">*</span>
              </label>
            </div>
          </div>

          {/* Bouton Créer mon compte */}
          <button
            type="submit"
            disabled={loading || !passwordValidation.isValid || !acceptedCgu || !acceptedPolitiqueConfidentialite}
            className="btn-teal w-full h-11 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Création du compte...
              </div>
            ) : (
              "Créer mon compte"
            )}
          </button>
        </form>

        {/* Séparateur */}
        <div className="border-t border-gray-200" />

        {/* Déjà un compte */}
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-3">Déjà un compte ?</p>
          <Link
            href="/login"
            className="inline-block w-full h-11 leading-[2.75rem] rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 text-center"
          >
            Se connecter
          </Link>
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
