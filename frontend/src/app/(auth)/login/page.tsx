"use client";

import { useState } from "react";
import { auth, db } from "@/lib/firebase/config";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Eye, EyeOff } from "lucide-react";

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
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      const docRef = doc(db, "users", uid);
      const userSnap = await getDoc(docRef);

      if (!userSnap.exists()) {
        throw new Error("Utilisateur non trouvé dans la base.");
      }

      const userData = userSnap.data();
      const role = userData.role;

      toast({
        title: "Connexion réussie",
        description: "Redirection vers votre tableau de bord...",
      });

      if (role === "kine") {
        router.push("/dashboard/kine/home");
      } else if (role === "patient") {
        router.push("/dashboard/patient/home");
      } else {
        throw new Error("Rôle utilisateur inconnu.");
      }

    } catch (error) {
      const err = error as Error;
      toast({
        variant: "destructive",
        title: "Erreur de connexion",
        description: err.message || "Vérifiez vos identifiants.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        


        {/* Header avec logo et titre */}
        <div className="text-center space-y-6">
          {/* Logo */}
          <div className="flex justify-center">
            <Image
              src="/logo.jpg"
              alt="Mon Assistant Kiné"
              width={120}
              height={120}
              className="mx-auto rounded-xl bg-white p-3 shadow-sm"
              priority
            />
          </div>

          {/* Titre et sous-titre */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Mon Assistant Kiné
            </h1>
            <p className="text-muted-foreground">
              Plateforme professionnelle de rééducation
            </p>
          </div>
        </div>

        {/* Card de connexion */}
        <Card className="shadow-lg border">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-2xl font-semibold text-center">Connexion</CardTitle>
            <CardDescription className="text-center">
              Accédez à votre espace professionnel sécurisé
            </CardDescription>
          </CardHeader>
          
          <form onSubmit={handleLogin}>
            <CardContent className="space-y-6">
              
              {/* Champ Email */}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-sm font-medium">
                  Adresse email
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="votre@email.com"
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    className="pl-10 h-12"
                    required 
                  />
                </div>
              </div>

              {/* Champ Mot de passe */}
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  Mot de passe
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    id="password" 
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    className="pl-10 pr-10 h-12"
                    required 
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Lien mot de passe oublié */}
              <div className="text-right">
                <Link 
                  href="/forgot-password" 
                  className="text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  Mot de passe oublié ?
                </Link>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-4 pt-6">
              
              {/* Bouton de connexion */}
              <Button 
                type="submit" 
                disabled={loading} 
                className="w-full h-12 text-base font-medium"
                size="lg"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Connexion en cours...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <LogIn className="h-4 w-4" />
                    Se connecter
                  </div>
                )}
              </Button>

              {/* Séparateur */}
              <div className="relative w-full">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-muted" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">ou</span>
                </div>
              </div>

              {/* Lien inscription */}
              <div className="text-center space-y-2">
                <p className="text-sm text-muted-foreground">
                  Pas encore de compte ?
                </p>
                <Button variant="outline" className="w-full h-12" asChild>
                  <Link href="/signup">
                    Créer un compte professionnel
                  </Link>
                </Button>
              </div>
            </CardFooter>
          </form>
        </Card>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground space-y-1">
          <p>© {new Date().getFullYear()} Mon Assistant Kiné</p>
          <p>Plateforme sécurisée - Données de santé protégées</p>
        </div>
      </div>
    </div>
  );
}