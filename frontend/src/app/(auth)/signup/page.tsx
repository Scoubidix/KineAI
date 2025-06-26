"use client";

import { useState } from "react";
import { auth } from "@/lib/firebase/config";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { UserPlus, ArrowLeft, User, Building, Phone, Mail, Calendar, MapPin, Hash, Lock } from "lucide-react";

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
    const { name, value } = e.target;
    
    // Reset des erreurs de validation personnalisées
    const input = e.target as HTMLInputElement;
    input.setCustomValidity('');
    
    // Validation spéciale pour le RPPS : seulement des chiffres
    if (name === 'rpps') {
      const numericValue = value.replace(/\D/g, ''); // Supprime tout ce qui n'est pas un chiffre
      setFormData({ ...formData, [name]: numericValue });
    } 
    // Validation spéciale pour le téléphone : seulement des chiffres et espaces
    else if (name === 'phone') {
      const phoneValue = value.replace(/[^\d\s]/g, ''); // Garde seulement chiffres et espaces
      setFormData({ ...formData, [name]: phoneValue });
    } 
    else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const {
      email,
      password,
      firstName,
      lastName,
      birthDate,
      phone,
      adresseCabinet,
      rpps,
    } = formData;

    // Validation du RPPS
    if (rpps.length !== 11) {
      // Déclenche la validation HTML5 native
      const rppsInput = document.getElementById('rpps') as HTMLInputElement;
      if (rppsInput) {
        rppsInput.setCustomValidity('Le numéro RPPS doit contenir exactement 11 chiffres');
        rppsInput.reportValidity();
      }
      setLoading(false);
      return;
    }

    // Validation du téléphone  
    const phoneDigits = phone.replace(/\s/g, ''); // Supprime les espaces
    if (phoneDigits.length !== 10 || !phoneDigits.match(/^[0-9]{10}$/)) {
      // Déclenche la validation HTML5 native
      const phoneInput = document.getElementById('phone') as HTMLInputElement;
      if (phoneInput) {
        phoneInput.setCustomValidity('Le numéro de téléphone doit contenir exactement 10 chiffres');
        phoneInput.reportValidity();
      }
      setLoading(false);
      return;
    }

    // Reset des erreurs de validation personnalisées
    const rppsInput = document.getElementById('rpps') as HTMLInputElement;
    const phoneInput = document.getElementById('phone') as HTMLInputElement;
    if (rppsInput) rppsInput.setCustomValidity('');
    if (phoneInput) phoneInput.setCustomValidity('');

    try {
      // 1. Créer le compte Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Créer l'entrée dans PostgreSQL (source unique de vérité)
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
          birthDate,
          phone,
          email,
          adresseCabinet,
          rpps,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erreur lors de la création du profil");
      }

      const kineData = await response.json();

      toast({
        title: "Inscription réussie !",
        description: `Bienvenue ${firstName} ${lastName}`,
      });

      router.push("/login");
    } catch (error) {
      const err = error as Error;
      
      toast({
        variant: "destructive",
        title: "Erreur d'inscription",
        description: err.message || "Une erreur est survenue lors de la création du compte.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        
        {/* Header avec logo et titre */}
        <div className="text-center space-y-4">
          {/* Logo */}
          <div className="flex justify-center">
            <Image
              src="/logo.jpg"
              alt="Mon Assistant Kiné"
              width={80}
              height={80}
              className="mx-auto rounded-xl bg-white p-2 shadow-sm"
              priority
            />
          </div>

          {/* Titre et sous-titre */}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Mon Assistant Kiné
            </h1>
            <p className="text-muted-foreground">
              Création de compte professionnel
            </p>
          </div>
        </div>

        {/* Card de création de compte */}
        <Card className="shadow-lg border">
          <CardHeader className="text-center pb-6">
            <CardTitle className="text-2xl font-semibold">Créer un Compte Kiné</CardTitle>
            <CardDescription>
              Réservé aux professionnels de kinésithérapie certifiés
            </CardDescription>
          </CardHeader>
          
          <form onSubmit={handleSignup}>
            <CardContent className="space-y-6">
              
              {/* Section Informations personnelles */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-foreground border-b pb-2">
                  Informations personnelles
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Prénom */}
                  <div className="space-y-2">
                    <Label htmlFor="firstName" className="text-sm font-medium">
                      Prénom
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="firstName" 
                        name="firstName" 
                        placeholder="Jean" 
                        value={formData.firstName}
                        onChange={handleChange} 
                        className="pl-10 h-12"
                        required 
                        disabled={loading} 
                      />
                    </div>
                  </div>

                  {/* Nom */}
                  <div className="space-y-2">
                    <Label htmlFor="lastName" className="text-sm font-medium">
                      Nom
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="lastName" 
                        name="lastName" 
                        placeholder="Dupont" 
                        value={formData.lastName}
                        onChange={handleChange} 
                        className="pl-10 h-12"
                        required 
                        disabled={loading} 
                      />
                    </div>
                  </div>

                  {/* Date de naissance */}
                  <div className="space-y-2">
                    <Label htmlFor="birthDate" className="text-sm font-medium">
                      Date de naissance
                    </Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="birthDate" 
                        name="birthDate" 
                        type="date" 
                        value={formData.birthDate}
                        onChange={handleChange} 
                        className="pl-10 h-12"
                        required 
                        disabled={loading} 
                      />
                    </div>
                  </div>

                  {/* Téléphone */}
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="text-sm font-medium">
                      Téléphone
                    </Label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="phone" 
                        name="phone" 
                        placeholder="06 12 34 56 78" 
                        value={formData.phone}
                        onChange={handleChange} 
                        className="pl-10 h-12"
                        required 
                        disabled={loading} 
                        maxLength={13}
                        onInvalid={(e) => e.preventDefault()}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section Informations professionnelles */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-foreground border-b pb-2">
                  Informations professionnelles
                </h3>
                
                <div className="grid grid-cols-1 gap-4">
                  {/* Adresse du cabinet */}
                  <div className="space-y-2">
                    <Label htmlFor="adresseCabinet" className="text-sm font-medium">
                      Adresse du cabinet
                    </Label>
                    <div className="relative">
                      <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="adresseCabinet" 
                        name="adresseCabinet" 
                        placeholder="123 Rue de la Santé, 75013 Paris" 
                        value={formData.adresseCabinet}
                        onChange={handleChange} 
                        className="pl-10 h-12"
                        required 
                        disabled={loading} 
                      />
                    </div>
                  </div>

                  {/* RPPS */}
                  <div className="space-y-2">
                    <Label htmlFor="rpps" className="text-sm font-medium">
                      Numéro RPPS
                    </Label>
                    <div className="relative">
                      <Hash className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="rpps" 
                        name="rpps" 
                        placeholder="12345678901" 
                        value={formData.rpps}
                        onChange={handleChange} 
                        className="pl-10 h-12"
                        required 
                        disabled={loading} 
                        maxLength={11}
                        pattern="[0-9]{11}"
                        title="Le numéro RPPS doit contenir exactement 11 chiffres"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Numéro RPPS à 11 chiffres (ex: 12345678901)
                    </p>
                  </div>
                </div>
              </div>

              {/* Section Connexion */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-foreground border-b pb-2">
                  Informations de connexion
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-medium">
                      Adresse email
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="email" 
                        name="email" 
                        type="email" 
                        placeholder="nom@exemple.com" 
                        value={formData.email}
                        onChange={handleChange} 
                        className="pl-10 h-12"
                        required 
                        disabled={loading} 
                      />
                    </div>
                  </div>

                  {/* Mot de passe */}
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-medium">
                      Mot de passe
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input 
                        id="password" 
                        name="password" 
                        type="password" 
                        placeholder="••••••••" 
                        value={formData.password}
                        onChange={handleChange} 
                        className="pl-10 h-12"
                        required 
                        disabled={loading} 
                        minLength={6} 
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Minimum 6 caractères
                    </p>
                  </div>
                </div>
              </div>

            </CardContent>

            <CardFooter className="flex flex-col space-y-4 pt-6">
              
              {/* Bouton d'inscription */}
              <Button 
                type="submit" 
                disabled={loading} 
                className="w-full h-12 text-base font-medium"
                size="lg"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Création du compte...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <UserPlus className="h-4 w-4" />
                    Créer mon compte professionnel
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

              {/* Liens de navigation */}
              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <Button variant="outline" className="flex-1 h-12" asChild>
                  <Link href="/login">
                    Déjà un compte ? Se connecter
                  </Link>
                </Button>
                <Button variant="ghost" className="flex-1 h-12" asChild>
                  <Link href="/">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Retour à l'accueil
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