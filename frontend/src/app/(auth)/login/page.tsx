"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase/config";
import { signInWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Authentification Firebase
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Récupérer les données depuis PostgreSQL
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/kine/profile`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await user.getIdToken()}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Utilisateur non trouvé dans la base de données.");
        }
        const errorData = await response.json();
        throw new Error(errorData.error || "Erreur lors de la récupération du profil");
      }

      const kineData = await response.json();

      // 3. ✨ Vérifier si l'email est vérifié
      if (!userCredential.user.emailVerified) {
        // Rediriger vers la page de vérification obligatoire
        router.push("/verify-email-required");
        return;
      }

      // 4. Redirection vers le dashboard (seulement si email vérifié)
      router.push("/dashboard/kine/home");

    } catch (error) {
      const err = error as Error;
      
      // Messages d'erreur spécifiques
      let errorMessage = "Vérifiez vos identifiants.";
      
      if (err.message.includes("user-not-found")) {
        errorMessage = "Aucun compte trouvé avec cette adresse email.";
      } else if (err.message.includes("wrong-password")) {
        errorMessage = "Mot de passe incorrect.";
      } else if (err.message.includes("invalid-email")) {
        errorMessage = "Adresse email invalide.";
      } else if (err.message.includes("non trouvé dans la base")) {
        errorMessage = "Votre compte n'est pas encore synchronisé. Contactez le support.";
      }

      toast({
        variant: "destructive",
        title: "Erreur de connexion",
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex justify-center pt-20 p-4">
      <div className="w-full max-w-sm space-y-8">

        {/* Logo */}
        <div className="flex justify-center">
          <Image
            src="/logo.png"
            alt="Mon Assistant Kiné"
            width={100}
            height={100}
            className="rounded-xl"
            priority
          />
        </div>

        {/* Titre */}
        <h1 className="text-2xl font-bold text-center" style={{ color: '#1f5c6a' }}>
          Mon Assistant Kiné
        </h1>

        <form onSubmit={handleLogin} className="space-y-5">

          {/* Email */}
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium text-gray-700">
              Adresse email
            </label>
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

          {/* Mot de passe */}
          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium text-gray-700">
              Mot de passe
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
          </div>

          {/* Mot de passe oublié */}
          <div className="text-right">
            <Link href="/forgot-password" className="text-sm text-teal-600 hover:text-teal-800">
              Mot de passe oublié ?
            </Link>
          </div>

          {/* Bouton Se connecter */}
          <button
            type="submit"
            disabled={loading}
            className="btn-teal w-full h-11 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Connexion en cours...
              </div>
            ) : (
              "Se connecter"
            )}
          </button>
        </form>

        {/* Séparateur */}
        <div className="border-t border-gray-200" />

        {/* Inscription */}
        <div className="text-center">
          <p className="text-sm text-gray-500 mb-3">Pas encore de compte ?</p>
          <Link
            href="/signup"
            className="inline-block w-full h-11 leading-[2.75rem] rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 text-center"
          >
            Créer un compte professionnel
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