'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  Download, 
  Loader2, 
  CheckCircle, 
  AlertCircle, 
  Clock, 
  Database,
  FileText,
  Shield,
  Calendar
} from 'lucide-react';
import rgpdService from '@/services/rgpdService';
import { useToast } from '@/hooks/use-toast';

export function RGPDExportModal({ isOpen, onClose, kineData }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [exportData, setExportData] = useState(null);
  const [error, setError] = useState(null);
  
  const { toast } = useToast();

  const handleGenerateExport = async () => {
    setIsGenerating(true);
    setError(null);
    
    try {
      const result = await rgpdService.generateDataExport();
      
      if (result.success) {
        setExportData(result);
        toast({
          title: "Export généré",
          description: "Votre export de données est prêt à télécharger.",
          className: "bg-green-50 border-green-200 text-green-800",
        });
      } else {
        setError(result.error);
        toast({
          title: "Erreur",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (err) {
      setError('Erreur inattendue lors de la génération');
      toast({
        title: "Erreur",
        description: "Erreur inattendue lors de la génération",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    if (!exportData?.downloadUrl) return;
    
    setIsDownloading(true);
    
    try {
      const filename = rgpdService.generateExportFilename(
        kineData?.firstName, 
        kineData?.lastName
      );
      
      const result = await rgpdService.downloadExport(exportData.downloadUrl, filename);
      
      if (result.success) {
        toast({
          title: "Téléchargement lancé",
          description: "Votre export ZIP a été téléchargé.",
          className: "bg-blue-50 border-blue-200 text-blue-800",
        });
      }
    } catch (err) {
      toast({
        title: "Erreur de téléchargement",
        description: "Impossible de télécharger le fichier",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const resetModal = () => {
    setExportData(null);
    setError(null);
    setIsGenerating(false);
    setIsDownloading(false);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            Export de vos données RGPD
          </DialogTitle>
          <DialogDescription>
            Téléchargez une copie complète de toutes vos données personnelles et professionnelles
            stockées dans notre système, conformément à l'Article 20 du RGPD.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informations sur l'export */}
          <Card>
            <CardContent className="pt-4">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Contenu de l'export
              </h4>
              
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Profil professionnel
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Liste des patients
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Programmes d'exercices
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Exercices personnalisés
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Historique des IA
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  Notifications
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Informations de sécurité */}
          <Card>
            <CardContent className="pt-4">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-600" />
                Informations importantes
              </h4>
              
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5 text-amber-600" />
                  <span>Le lien de téléchargement expire dans <strong>24 heures</strong></span>
                </div>
                <div className="flex items-start gap-2">
                  <Shield className="h-4 w-4 mt-0.5 text-green-600" />
                  <span>Vos données sont chiffrées et sécurisées pendant le transfert</span>
                </div>
                <div className="flex items-start gap-2">
                  <FileText className="h-4 w-4 mt-0.5 text-blue-600" />
                  <span>Export au format ZIP avec fichiers JSON structurés</span>
                </div>
                <div className="flex items-start gap-2">
                  <Database className="h-4 w-4 mt-0.5 text-purple-600" />
                  <span>Conforme à l'Article 20 du RGPD (droit à la portabilité)</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Status de l'export */}
          {exportData && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <h4 className="font-semibold text-green-900">Export prêt à télécharger</h4>
                </div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-green-700">Taille des données :</span>
                    <Badge variant="secondary" className="bg-green-100 text-green-800">
                      {rgpdService.formatDataSize(exportData.dataSize)}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-700">Expire le :</span>
                    <Badge variant="outline" className="border-amber-300 text-amber-700">
                      <Calendar className="h-3 w-3 mr-1" />
                      {rgpdService.formatExpiryDate(exportData.validUntil)}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Erreur */}
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <div>
                    <h4 className="font-semibold text-red-900">Erreur</h4>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            <Button variant="outline" onClick={handleClose}>
              Fermer
            </Button>
            
            {!exportData ? (
              <Button
                onClick={handleGenerateExport}
                disabled={isGenerating}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Génération en cours...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 mr-2" />
                    Générer l'export
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={handleDownload}
                disabled={isDownloading}
                className="bg-green-600 hover:bg-green-700"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Téléchargement...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Télécharger ZIP
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Note légale */}
          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded">
            <strong>Note :</strong> Cet export contient toutes vos données personnelles. 
            Veillez à le stocker en sécurité et à ne le partager qu'avec des tiers de confiance. 
            Vous pouvez générer un nouvel export à tout moment.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}