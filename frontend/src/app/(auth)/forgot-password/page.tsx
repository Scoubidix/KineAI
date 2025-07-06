"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Send, CheckCircle } from "lucide-react";
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
      // Validation côté client
      const emailValidation = validateEmail(email);
      if (!emailValidation.success) {
        toast({
          variant: "destructive",
          title: "Email invalide",
          description: emailValidation.error,
        });
        return;
      }

      // Envoi de l'email de réinitialisation
      const result = await sendPasswordReset(email);

      if (result.success) {
        setEmailSent(true);
        toast({
          title: "Email envoyé",
          description: result.message,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Erreur",
          description: result.error,
        });
      }

    } catch (error) {
      console.error('Erreur lors de l\'envoi:', error);
      toast({
        variant: "destructive",
        title: "Erreur inattendue",
        description: "Une erreur s'est produite. Veuillez réessayer.",
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
              Réinitialisation du mot de passe
            </p>
          </div>
        </div>

        {/* Card de réinitialisation */}
        <Card className="shadow-lg border">
          <CardHeader className="space-y-1 pb-6">
            <CardTitle className="text-2xl font-semibold text-center">
              {emailSent ? "Email envoyé" : "Mot de passe oublié"}
            </CardTitle>
            <CardDescription className="text-center">
              {emailSent 
                ? "Vérifiez votre boîte de réception"
                : "Saisissez votre adresse email pour recevoir un lien de réinitialisation"
              }
            </CardDescription>
          </CardHeader>
          
          {!emailSent ? (
            <form onSubmit={handleSendReset}>
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
                      disabled={loading}
                    />
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col space-y-4 pt-6">
                
                {/* Bouton d'envoi */}
                <Button 
                  type="submit" 
                  disabled={loading} 
                  className="w-full h-12 text-base font-medium"
                  size="lg"
                >
                  {loading ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Envoi en cours...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Send className="h-4 w-4" />
                      Envoyer le lien de réinitialisation
                    </div>
                  )}
                </Button>

                {/* Lien retour */}
                <Button variant="outline" className="w-full h-12" asChild>
                  <Link href="/login">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Retour à la connexion
                  </Link>
                </Button>
              </CardFooter>
            </form>
          ) : (
            /* État après envoi */
            <CardContent className="space-y-6">
              
              {/* Icône de succès */}
              <div className="flex justify-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
              </div>

              {/* Message de confirmation */}
              <div className="text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  Un email de réinitialisation a été envoyé à :
                </p>
                <p className="font-medium text-foreground">{email}</p>
                <p className="text-sm text-muted-foreground">
                  Cliquez sur le lien dans l'email pour créer un nouveau mot de passe.
                  <br />
                  <span className="text-xs">Le lien expire dans 1 heure.</span>
                </p>
              </div>

              {/* Actions après envoi */}
              <div className="flex flex-col space-y-3 pt-4">
                <Button 
                  onClick={() => {
                    setEmailSent(false);
                    setEmail("");
                  }}
                  variant="outline" 
                  className="w-full"
                >
                  Envoyer à une autre adresse
                </Button>
                
                <Button variant="ghost" className="w-full" asChild>
                  <Link href="/login">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Retour à la connexion
                  </Link>
                </Button>
              </div>
            </CardContent>
          )}
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