"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Mail, 
  RefreshCw, 
  LogOut, 
  AlertTriangle, 
  CheckCircle,
  Home,
  ArrowLeft
} from "lucide-react";
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

  // Récupérer l'email de l'utilisateur au chargement
  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      setUserEmail(user.email || "");
    } else {
      // Si pas d'utilisateur connecté, rediriger vers login
      router.replace('/login');
    }
  }, [auth.currentUser, router]);

  // Vérifier périodiquement si l'email a été vérifié
  useEffect(() => {
    const checkEmailVerification = async () => {
      const user = auth.currentUser;
      if (user) {
        await user.reload(); // Actualiser les infos utilisateur
        if (user.emailVerified) {
          toast({
            title: "Email vérifié !",
            description: "Votre compte est maintenant actif.",
          });
          router.push('/dashboard/kine/home');
        }
      }
    };

    // Vérifier toutes les 5 secondes
    const interval = setInterval(checkEmailVerification, 5000);
    
    return () => clearInterval(interval);
  }, [auth.currentUser, router, toast]);

  const handleResendEmail = async () => {
    setResendLoading(true);
    try {
      const result = await resendEmailVerification();
      
      if (result.success) {
        setEmailSent(true);
        toast({
          title: "Email renvoyé",
          description: "Un nouvel email de vérification a été envoyé à votre adresse.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Erreur",
          description: result.error || "Impossible de renvoyer l'email.",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Une erreur inattendue s'est produite.",
      });
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
          toast({
            title: "Email vérifié !",
            description: "Redirection vers votre dashboard...",
          });
          router.push('/dashboard/kine/home');
        } else {
          toast({
            variant: "destructive",
            title: "Email non vérifié",
            description: "Votre email n'est pas encore vérifié. Vérifiez votre boîte de réception.",
          });
        }
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de vérifier le statut de votre email.",
      });
    } finally {
      setCheckingStatus(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      toast({
        title: "Déconnecté",
        description: "Vous avez été déconnecté avec succès.",
      });
      router.replace('/login');
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Erreur lors de la déconnexion.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        
        {/* Header avec logo et titre */}
        <div className="text-center space-y-6">
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

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Mon Assistant Kiné
            </h1>
            <p className="text-muted-foreground">
              Vérification de votre email requise
            </p>
          </div>
        </div>

        {/* Card de vérification obligatoire */}
        <Card className="shadow-lg border border-orange-200">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold text-center flex items-center justify-center gap-2">
              <AlertTriangle className="h-6 w-6 text-orange-500" />
              Vérification requise
            </CardTitle>
            <CardDescription className="text-center">
              Vous devez vérifier votre adresse email pour accéder à votre compte
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-6">
            
            {/* Message principal */}
            <div className="text-center space-y-4">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                <Mail className="h-8 w-8 text-orange-600" />
              </div>
              
              <div className="space-y-2">
                <h3 className="font-semibold text-foreground">
                  Vérifiez votre adresse email
                </h3>
                <p className="text-sm text-muted-foreground">
                  Un email de vérification a été envoyé à :
                </p>
                <p className="font-medium text-foreground break-all">
                  {userEmail}
                </p>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-muted/50 p-4 rounded-lg space-y-3">
              <h4 className="font-medium text-foreground text-sm">
                📧 Instructions :
              </h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Vérifiez votre boîte de réception</li>
                <li>• Consultez aussi vos <strong>spams/indésirables</strong></li>
                <li>• Cliquez sur le lien dans l'email</li>
                <li>• Revenez ici, la page se mettra à jour automatiquement</li>
              </ul>
            </div>

            {/* Statut et actions */}
            <div className="space-y-3">
              
              {/* Vérification automatique */}
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <div className="w-3 h-3 border border-primary/30 border-t-primary rounded-full animate-spin" />
                <span>Vérification automatique en cours...</span>
              </div>

              {/* Bouton vérifier maintenant */}
              <Button 
                variant="outline" 
                className="w-full"
                onClick={handleCheckNow}
                disabled={checkingStatus}
              >
                {checkingStatus ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Vérification...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    J'ai vérifié mon email
                  </div>
                )}
              </Button>

              {/* Bouton renvoyer email */}
              <Button 
                variant="secondary" 
                className="w-full"
                onClick={handleResendEmail}
                disabled={resendLoading}
              >
                {resendLoading ? (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Envoi en cours...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    {emailSent ? "Renvoyer l'email" : "Renvoyer l'email de vérification"}
                  </div>
                )}
              </Button>
            </div>

            {/* Confirmation d'envoi */}
            {emailSent && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Email envoyé !</span>
                </div>
                <p className="text-sm text-green-600 mt-1">
                  Vérifiez votre boîte de réception et vos spams.
                </p>
              </div>
            )}

            {/* Actions secondaires */}
            <div className="border-t pt-4 space-y-3">
              <Button 
                variant="ghost" 
                className="w-full"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4 mr-2" />
                Se déconnecter et changer de compte
              </Button>
              
              <Button variant="outline" className="w-full" asChild>
                <Link href="/login">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Retour à la connexion
                </Link>
              </Button>
            </div>

          </CardContent>
        </Card>

        {/* Note de sécurité */}
        <div className="text-center text-xs text-muted-foreground space-y-1">
          <p>🔒 <strong>Pourquoi cette vérification ?</strong></p>
          <p>La vérification email garantit la sécurité de votre compte professionnel et la réception des communications importantes.</p>
          <p className="pt-2">© {new Date().getFullYear()} Mon Assistant Kiné - Plateforme sécurisée</p>
        </div>
      </div>
    </div>
  );
}