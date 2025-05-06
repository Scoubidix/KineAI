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
    <main className="flex items-center justify-center min-h-screen bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-2xl">Connexion</CardTitle>
          <CardDescription>Accédez à votre espace personnel</CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between items-center">
            <Link href="/register" className="text-sm underline">Créer un compte</Link>
            <Button type="submit" disabled={loading} className="gap-2">
              <LogIn className="h-4 w-4" />
              Se connecter
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
