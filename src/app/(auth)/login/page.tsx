"use client";

import { useState } from "react";
import { auth, db } from "@/lib/firebase/config";
import { signInWithEmailAndPassword } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      // Récupérer le rôle depuis Firestore
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

      // Redirection selon le rôle
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
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-background via-secondary/30 to-background p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-accent mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10h-1.1" />
            <path d="M18 18.5V13a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v5.5" />
            <path d="M14 13.5V12a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v1.5" />
            <path d="M12 12v10" />
            <path d="m8 16 1.5-1 1.5 1" />
            <path d="m13 16 1.5-1 1.5 1" />
            <path d="M9 8h6" />
            <path d="M9 6h6" />
          </svg>
          <CardTitle className="text-2xl font-bold text-primary">Accès KineAI</CardTitle>
          <CardDescription>Connectez-vous ou créez votre compte.</CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="nom@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                placeholder="********"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              <LogIn className="mr-2 h-4 w-4" />
              {loading ? "Connexion..." : "Se Connecter"}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              Pas encore de compte ?{" "}
              <Button asChild variant="link" className="p-0 h-auto text-accent">
                <Link href="/signup">S'inscrire ici</Link>
              </Button>
            </div>
            <Button asChild variant="outline" size="sm" className="w-full mt-2">
              <Link href="/">Retour à l'accueil</Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
