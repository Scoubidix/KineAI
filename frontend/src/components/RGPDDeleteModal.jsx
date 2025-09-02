'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Trash2, 
  Loader2, 
  AlertTriangle, 
  Shield, 
  Clock, 
  Database,
  FileText,
  CheckCircle,
  XCircle,
  CreditCard,
  Download,
  Timer
} from 'lucide-react';
import rgpdService from '@/services/rgpdService';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';
import { getAuth, signOut } from 'firebase/auth';
import { app } from '@/lib/firebase/config';

export function RGPDDeleteModal({ 
  isOpen, 
  onClose, 
  kineData 
}) {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [eligibility, setEligibility] = useState(null);
  const [confirmationText, setConfirmationText] = useState('');
  const [understands7DaysDelay, setUnderstands7DaysDelay] = useState(false);
  const [agreesToDataLoss, setAgreesToDataLoss] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(10);
  const [canProceed, setCanProceed] = useState(false);

  const { toast } = useToast();
  const router = useRouter();

  // Vérification d'éligibilité au montage
  useEffect(() => {
    if (isOpen) {
      checkEligibility();
    }
  }, [isOpen]);

  // Countdown pour la sécurité
  useEffect(() => {
    if (step === 2 && countdownSeconds > 0) {
      const timer = setTimeout(() => {
        setCountdownSeconds(prev => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (step === 2 && countdownSeconds === 0) {
      setCanProceed(true);
    }
  }, [step, countdownSeconds]);

  const checkEligibility = async () => {
    setIsLoading(true);
    try {
      const result = await rgpdService.checkDeletionEligibility();
      setEligibility(result);
    } catch (error) {
      console.error('Erreur vérification éligibilité:', error);
      setEligibility({
        canDelete: false,
        planType: 'UNKNOWN',
        reason: 'Erreur lors de la vérification'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!rgpdService.validateConfirmationText(confirmationText)) {
      toast({
        title: "Confirmation incorrecte",
        description: "Vous devez saisir exactement 'SUPPRIMER' pour confirmer",
        variant: "destructive",
      });
      return;
    }

    if (!understands7DaysDelay || !agreesToDataLoss) {
      toast({
        title: "Conditions non acceptées",
        description: "Vous devez accepter toutes les conditions pour continuer",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const result = await rgpdService.deleteAccount({
        confirmationText,
        understands7DaysDelay,
        agreesToDataLoss
      });

      if (result.success) {
        // Succès - afficher les détails et déconnecter
        toast({
          title: "Compte supprimé",
          description: "Votre compte a été supprimé définitivement",
          className: "bg-green-50 border-green-200 text-green-800",
        });

        // Déconnexion Firebase
        try {
          const auth = getAuth(app);
          await signOut(auth);
        } catch (signOutError) {
          console.error('Erreur déconnexion:', signOutError);
        }

        // Redirection vers la page d'accueil après un délai
        setTimeout(() => {
          router.replace('/');
        }, 2000);

      } else {
        // Erreur spécifique
        let errorMessage = result.error;
        
        if (result.code === 'SUBSCRIPTION_ACTIVE') {
          errorMessage = `Vous devez d'abord annuler votre abonnement ${result.planType}`;
        } else if (result.code === 'EXPORT_REQUIRED') {
          errorMessage = 'Vous devez d\'abord exporter vos données (export récent requis)';
        }

        toast({
          title: "Suppression impossible",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Erreur inattendue lors de la suppression",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetModal = () => {
    setStep(1);
    setConfirmationText('');
    setUnderstands7DaysDelay(false);
    setAgreesToDataLoss(false);
    setCountdownSeconds(10);
    setCanProceed(false);
    setEligibility(null);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
          <AlertTriangle className="h-8 w-8 text-red-600" />
        </div>
        <h3 className="text-lg font-semibold text-red-900 mb-2">
          Suppression définitive de compte
        </h3>
        <p className="text-red-700">
          Cette action est irréversible et supprimera toutes vos données
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2">Vérification de votre éligibilité...</span>
        </div>
      ) : eligibility ? (
        <>
          {/* Status d'éligibilité */}
          <Card className={eligibility.canDelete ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3 mb-3">
                {eligibility.canDelete ? (
                  <CheckCircle className="h-5 w-5 text-amber-600" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600" />
                )}
                <div>
                  <h4 className={`font-semibold ${eligibility.canDelete ? 'text-amber-900' : 'text-red-900'}`}>
                    {eligibility.canDelete ? 'Suppression autorisée' : 'Suppression non autorisée'}
                  </h4>
                  <p className={`text-sm mt-1 ${eligibility.canDelete ? 'text-amber-700' : 'text-red-700'}`}>
                    Plan actuel : {eligibility.planType}
                  </p>
                </div>
              </div>
              
              {eligibility.reason && (
                <div className="bg-white/50 p-3 rounded border">
                  <p className="text-sm">{eligibility.reason}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Prérequis */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prérequis pour la suppression</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                {eligibility.planType === 'FREE' ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <CreditCard className="h-5 w-5 text-red-600" />
                )}
                <span className={`text-sm ${eligibility.planType === 'FREE' ? 'text-green-700' : 'text-red-700'}`}>
                  Plan FREE requis (actuellement : {eligibility.planType})
                </span>
              </div>
              
              <div className="flex items-center gap-3">
                {eligibility.hasRecentExport ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <Download className="h-5 w-5 text-amber-600" />
                )}
                <div className="flex-1">
                  <span className={`text-sm ${eligibility.hasRecentExport ? 'text-green-700' : 'text-amber-700'}`}>
                    Export de données effectué
                  </span>
                  {eligibility.hasRecentExport && eligibility.lastExport && (
                    <div className="text-xs text-green-600 mt-1">
                      Dernier export : {new Date(eligibility.lastExport.generatedAt).toLocaleString('fr-FR')}
                      {eligibility.lastExport.isDownloaded && ' (téléchargé)'}
                    </div>
                  )}
                  {!eligibility.hasRecentExport && (
                    <div className="text-xs text-amber-600 mt-1">
                      Requis avant suppression (export récent &lt; 7 jours)
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Données qui seront supprimées */}
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="text-base text-red-900 flex items-center gap-2">
                <Database className="h-4 w-4" />
                Données qui seront supprimées
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>• Profil professionnel</div>
                <div>• Tous vos patients</div>
                <div>• Programmes d'exercices</div>
                <div>• Exercices personnalisés</div>
                <div>• Historique des IA</div>
                <div>• Notifications</div>
                <div>• Données d'abonnement</div>
                <div>• Sessions de chat</div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            <Button variant="outline" onClick={handleClose}>
              Annuler
            </Button>
            
            {eligibility.canDelete ? (
              <Button
                variant="destructive"
                onClick={() => setStep(2)}
                className="bg-red-600 hover:bg-red-700"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Continuer la suppression
              </Button>
            ) : (
              <Button
                variant="outline"
                disabled
                className="opacity-50 cursor-not-allowed"
              >
                <Shield className="h-4 w-4 mr-2" />
                Suppression bloquée
              </Button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
          <Timer className="h-8 w-8 text-red-600" />
        </div>
        <h3 className="text-lg font-semibold text-red-900 mb-2">
          Confirmation finale
        </h3>
        <p className="text-red-700">
          Dernière étape avant la suppression définitive
        </p>
      </div>

      {/* Période de sécurité */}
      {countdownSeconds > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-3 text-center justify-center">
              <Clock className="h-5 w-5 text-amber-600" />
              <span className="text-amber-900">
                Période de réflexion : <strong>{countdownSeconds}s</strong>
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confirmations requises */}
      <div className="space-y-4">
        <div>
          <Label htmlFor="confirmation">
            Tapez <span className="font-bold text-red-600">SUPPRIMER</span> pour confirmer
          </Label>
          <Input
            id="confirmation"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder="Tapez exactement 'SUPPRIMER'"
            className="mt-1"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="understands7days"
              checked={understands7DaysDelay}
              onCheckedChange={setUnderstands7DaysDelay}
            />
            <Label htmlFor="understands7days" className="text-sm leading-relaxed">
              Je comprends qu'il y aura un délai de <strong>7 jours</strong> avant la suppression 
              effective et que je peux annuler pendant cette période
            </Label>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="agreesDataLoss"
              checked={agreesToDataLoss}
              onCheckedChange={setAgreesToDataLoss}
            />
            <Label htmlFor="agreesDataLoss" className="text-sm leading-relaxed">
              J'accepte la <strong>perte définitive</strong> de toutes mes données 
              et je confirme avoir exporté les informations importantes
            </Label>
          </div>
        </div>
      </div>

      {/* Informations importantes */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-4">
          <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Ce qui va se passer
          </h4>
          
          <div className="space-y-1 text-sm text-blue-700">
            <div>1. Votre compte sera marqué pour suppression</div>
            <div>2. Délai de grâce de 7 jours avant suppression effective</div>
            <div>3. Email de confirmation et possibilité d'annulation</div>
            <div>4. Suppression définitive de toutes les données après 7 jours</div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-end">
        <Button variant="outline" onClick={() => setStep(1)}>
          Retour
        </Button>
        
        <Button
          variant="destructive"
          onClick={handleDeleteAccount}
          disabled={!canProceed || isLoading || !rgpdService.validateConfirmationText(confirmationText) || !understands7DaysDelay || !agreesToDataLoss}
          className="bg-red-600 hover:bg-red-700"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Suppression en cours...
            </>
          ) : (
            <>
              <Trash2 className="h-4 w-4 mr-2" />
              Supprimer définitivement
            </>
          )}
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-900">
            <AlertTriangle className="h-5 w-5" />
            Suppression de compte - Étape {step}/2
          </DialogTitle>
          <DialogDescription>
            {step === 1 
              ? "Vérification des prérequis et informations sur la suppression"
              : "Confirmation finale pour la suppression définitive de votre compte"
            }
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? renderStep1() : renderStep2()}

        {/* Note légale */}
        <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded border-t">
          <strong>Information légale :</strong> Cette suppression est conforme à l'Article 17 du RGPD 
          (droit à l'effacement). Un délai de grâce de 7 jours est appliqué pour votre sécurité.
        </div>
      </DialogContent>
    </Dialog>
  );
}