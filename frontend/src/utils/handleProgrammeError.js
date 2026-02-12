/**
 * Gère les erreurs de création de programme avec des toasts user-friendly
 * @param {Error|Response} error - L'erreur ou réponse fetch
 * @param {Function} toast - Fonction toast de useToast
 */
export const handleProgrammeCreationError = async (error, toast) => {
  try {
    // Si c'est une réponse fetch avec status 403 (Forbidden)
    if (error.status === 403) {
      const errorData = await error.json();
      
      if (errorData?.code === 'PLAN_REQUIRED') {
        // Plan FREE - Abonnement requis
        toast({
          title: "🚫 Abonnement requis",
          description: "Un abonnement est requis pour créer un programme. Cliquez sur 'Upgrade' en haut à droite pour découvrir nos plans.",
          className: "bg-gradient-to-r from-[#4db3c5] to-[#1f5c6a] text-white border-0",
          duration: 8000, // Plus long pour laisser le temps de lire
        });
        return;
      }
      
      if (errorData?.code === 'PROGRAMME_LIMIT_REACHED') {
        // Limite de programmes atteinte
        const message = errorData.message || "Vous avez atteint la limite de programmes de votre plan actuel";
        toast({
          title: "⚠️ Limite atteinte",
          description: `${message} Cliquez sur 'Upgrade' en haut à droite pour augmenter votre limite.`,
          className: "bg-gradient-to-r from-[#4db3c5] to-[#1f5c6a] text-white border-0",
          duration: 8000,
        });
        return;
      }
      
      // Autres erreurs 403
      toast({
        title: "❌ Accès refusé",
        description: errorData.message || "Vous n'avez pas les droits pour effectuer cette action",
        variant: "destructive",
        duration: 4000
      });
      return;
    }
    
    // Si c'est une réponse fetch avec autre statut d'erreur
    if (error.status && !error.ok) {
      toast({
        title: "❌ Erreur serveur",
        description: "Une erreur est survenue côté serveur. Veuillez réessayer.",
        variant: "destructive", 
        duration: 4000
      });
      return;
    }
    
    // Erreurs réseau ou autres
    toast({
      title: "❌ Erreur réseau",
      description: "Impossible de contacter le serveur. Vérifiez votre connexion.",
      variant: "destructive",
      duration: 4000
    });
    
  } catch (parseError) {
    // Erreur lors du parsing JSON ou autre erreur inattendue
    console.error('Erreur parsing error response:', parseError);
    toast({
      title: "❌ Erreur inattendue", 
      description: "Une erreur technique est survenue. Veuillez réessayer.",
      variant: "destructive",
      duration: 4000
    });
  }
};