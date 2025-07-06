"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, ArrowLeft, Check, X } from "lucide-react";
import { verifyResetCode, confirmNewPassword, validatePassword } from "@/lib/auth-utils";

// ✅ Composant qui utilise useSearchParams - isolé dans Suspense
function ResetPasswordForm() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [codeValid, setCodeValid] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [resetComplete, setResetComplete] = useState(false);
  const [error, setError] = useState("");

  const router = useRouter();
  const searchParams = useSearchParams(); // ✅ Maintenant dans Suspense
  const { toast } = useToast();

  // Récupérer le code depuis l'URL
  const oobCode = searchParams.get('oobCode');

  // Validation du mot de passe
  const validatePasswordStrength = (password: string) => {
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
      passwordsMatch: confirmPassword ? password === confirmPassword : true
    };
  };

  const passwordValidation = validatePasswordStrength(newPassword);

  // Vérifier le code au chargement de la page
  useEffect(() => {
    const verifyCode = async () => {
      if (!oobCode) {
        setError("Code de réinitialisation manquant. Veuillez cliquer sur le lien dans votre email.");
        setVerifying(false);
        return;
      }

      try {
        const result = await verifyResetCode(oobCode);
        
        if (result.success && result.email) {
          setCodeValid(true);
          setUserEmail(result.email);
        } else {
          setError(result.error || "Code de réinitialisation invalide.");
        }
      } catch (error) {
        console.error('Erreur lors de la vérification:', error);
        setError("Erreur lors de la vérification du code.");
      } finally {
        setVerifying(false);
      }
    };

    verifyCode();
  }, [oobCode]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validation côté client renforcée
      if (!passwordValidation.isValid) {
        toast({
          variant: "destructive",
          title: "Mot de passe invalide",
          description: "Le mot de passe ne respecte pas tous les critères de sécurité.",
        });
        return;
      }

      if (newPassword !== confirmPassword) {
        toast({
          variant: "destructive",
          title: "Erreur de confirmation",
          description: "Les mots de passe ne correspondent pas.",
        });
        return;
      }

      // Confirmer le nouveau mot de passe
      const result = await confirmNewPassword(oobCode!, newPassword);

      if (result.success) {
        setResetComplete(true);
        toast({
          title: "Mot de passe modifié",
          description: result.message,
        });
        
        // Redirection automatique après 3 secondes
        setTimeout(() => {
          router.push('/login');
        }, 3000);

      } else {
        toast({
          variant: "destructive",
          title: "Erreur",
          description: result.error,
        });
      }

    } catch (error) {
      console.error('Erreur lors de la réinitialisation:', error);
      toast({
        variant: "destructive",
        title: "Erreur inattendue",
        description: "Une erreur s'est produite. Veuillez réessayer.",
      });
    } finally {
      setLoading(false);
    }
  };

  // État de vérification du code
  if (verifying) {
    return (
      <div className="text-center space-y-4">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
        <p className="text-muted-foreground">Vérification du lien...</p>
      </div>
    );
  }

  return (
    <Card className="shadow-lg border">
      <CardHeader className="space-y-1 pb-6">
        <CardTitle className="text-2xl font-semibold text-center">
          {resetComplete ? "Succès" : codeValid ? "Nouveau mot de passe" : "Lien invalide"}
        </CardTitle>
        <CardDescription className="text-center">
          {resetComplete 
            ? "Votre mot de passe a été modifié avec succès"
            : codeValid 
              ? `Créez un nouveau mot de passe pour ${userEmail}`
              : "Le lien de réinitialisation est invalide ou a expiré"
          }
        </CardDescription>
      </CardHeader>
      
      {/* Erreur - Code invalide */}
      {!codeValid && !resetComplete && (
        <CardContent className="space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-red-600" />
            </div>
          </div>

          <div className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              {error}
            </p>
            <div className="flex flex-col space-y-3 pt-4">
              <Button asChild className="w-full">
                <Link href="/forgot-password">
                  Demander un nouveau lien
                </Link>
              </Button>
              
              <Button variant="outline" className="w-full" asChild>
                <Link href="/login">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Retour à la connexion
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      )}

      {/* Succès - Mot de passe modifié */}
      {resetComplete && (
        <CardContent className="space-y-6">
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
          </div>

          <div className="text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Vous allez être redirigé vers la page de connexion dans quelques secondes...
            </p>
            <Button className="w-full" asChild>
              <Link href="/login">
                Se connecter maintenant
              </Link>
            </Button>
          </div>
        </CardContent>
      )}

      {/* Formulaire - Nouveau mot de passe */}
      {codeValid && !resetComplete && (
        <form onSubmit={handleResetPassword}>
          <CardContent className="space-y-6">
            
            {/* Champ Nouveau mot de passe */}
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="text-sm font-medium">
                Nouveau mot de passe
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="newPassword" 
                  type={showNewPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={newPassword} 
                  onChange={(e) => setNewPassword(e.target.value)} 
                  className="pl-10 pr-10 h-12"
                  required 
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                  disabled={loading}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Champ Confirmer mot de passe */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-sm font-medium">
                Confirmer le mot de passe
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input 
                  id="confirmPassword" 
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  className="pl-10 pr-10 h-12"
                  required 
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                  disabled={loading}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Indicateurs de validation du mot de passe */}
            {newPassword && (
              <div className="mt-3 p-3 bg-muted/50 rounded-md space-y-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Critères de sécurité :
                </p>
                <div className="grid grid-cols-1 gap-1 text-xs">
                  <div className={`flex items-center gap-2 ${passwordValidation.minLength ? 'text-green-600' : 'text-red-500'}`}>
                    {passwordValidation.minLength ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    <span>Au moins 8 caractères</span>
                  </div>
                  <div className={`flex items-center gap-2 ${passwordValidation.hasUpperCase ? 'text-green-600' : 'text-red-500'}`}>
                    {passwordValidation.hasUpperCase ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    <span>Une majuscule (A-Z)</span>
                  </div>
                  <div className={`flex items-center gap-2 ${passwordValidation.hasLowerCase ? 'text-green-600' : 'text-red-500'}`}>
                    {passwordValidation.hasLowerCase ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    <span>Une minuscule (a-z)</span>
                  </div>
                  <div className={`flex items-center gap-2 ${passwordValidation.hasNumbers ? 'text-green-600' : 'text-red-500'}`}>
                    {passwordValidation.hasNumbers ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    <span>Un chiffre (0-9)</span>
                  </div>
                  <div className={`flex items-center gap-2 ${passwordValidation.hasSpecialChar ? 'text-green-600' : 'text-red-500'}`}>
                    {passwordValidation.hasSpecialChar ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                    <span>Un caractère spécial (!@#$%^&*(),.?":{}|&lt;&gt;)</span>
                  </div>
                  {confirmPassword && (
                    <div className={`flex items-center gap-2 ${passwordValidation.passwordsMatch ? 'text-green-600' : 'text-red-500'}`}>
                      {passwordValidation.passwordsMatch ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                      <span>Les mots de passe correspondent</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col space-y-4 pt-6">
            
            {/* Bouton de confirmation */}
            <Button 
              type="submit" 
              disabled={loading || !passwordValidation.isValid || newPassword !== confirmPassword} 
              className="w-full h-12 text-base font-medium"
              size="lg"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Modification en cours...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Modifier le mot de passe
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
      )}
    </Card>
  );
}

// ✅ Composant principal avec Suspense
export default function ResetPasswordPage() {
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
              Nouveau mot de passe
            </p>
          </div>
        </div>

        {/* ✅ Composant avec useSearchParams wrappé dans Suspense */}
        <Suspense fallback={
          <div className="text-center space-y-4">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground">Chargement...</p>
          </div>
        }>
          <ResetPasswordForm />
        </Suspense>

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground space-y-1">
          <p>© {new Date().getFullYear()} Mon Assistant Kiné</p>
          <p>Plateforme sécurisée - Données de santé protégées</p>
        </div>
      </div>
    </div>
  );
}