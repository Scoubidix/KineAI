"use client";

import { useState } from "react";
import { auth, db } from "@/lib/firebase/config";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { UserPlus, ArrowLeft } from "lucide-react";

export default function SignupPage() {
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    birthDate: "",
    phone: "",
    email: "",
    password: "",
    adresseCabinet: "",
    rpps: ""
  });

  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { email, password, firstName, lastName, birthDate, phone, adresseCabinet, rpps } = formData;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await setDoc(doc(db, "users", user.uid), {
        id: user.uid,
        firstName,
        lastName,
        birthDate,
        phone,
        email,
        adresseCabinet,
        rpps,
        role: "kine",
        linkedPatients: [],
        createdAt: new Date()
      });

      toast({
        title: "Inscription réussie !",
        description: `Votre compte kiné a bien été créé.`,
      });

      router.push("/login");
    } catch (error) {
      const err = error as Error;
      toast({
        variant: "destructive",
        title: "Erreur d'inscription",
        description: err.message || "Une erreur est survenue.",
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
          <CardTitle className="text-2xl font-bold text-primary">Créer un Compte Kiné</CardTitle>
          <CardDescription>Réservé aux professionnels de santé.</CardDescription>
        </CardHeader>
        <form onSubmit={handleSignup}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Prénom</Label>
              <Input id="firstName" name="firstName" placeholder="Jean" onChange={handleChange} required disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Nom</Label>
              <Input id="lastName" name="lastName" placeholder="Dupont" onChange={handleChange} required disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="birthDate">Date de naissance</Label>
              <Input id="birthDate" name="birthDate" type="date" onChange={handleChange} required disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" name="phone" placeholder="0600000000" onChange={handleChange} required disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="nom@exemple.com" onChange={handleChange} required disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adresseCabinet">Adresse du cabinet</Label>
              <Input id="adresseCabinet" name="adresseCabinet" placeholder="123 Rue de la Santé, Paris" onChange={handleChange} required disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rpps">Numéro RPPS</Label>
              <Input id="rpps" name="rpps" placeholder="12345678901" onChange={handleChange} required disabled={loading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input id="password" name="password" type="password" placeholder="********" onChange={handleChange} required disabled={loading} minLength={6} />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={loading}>
              <UserPlus className="mr-2 h-4 w-4" />
              {loading ? "Création du compte..." : "S'inscrire"}
            </Button>
            <div className="text-center text-sm text-muted-foreground">
              Déjà un compte ?{" "}
              <Button asChild variant="link" className="p-0 h-auto text-accent">
                <Link href="/login">Se connecter</Link>
              </Button>
            </div>
            <Button asChild variant="outline" size="sm" className="w-full mt-2">
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" /> Retour à l'accueil
              </Link>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
