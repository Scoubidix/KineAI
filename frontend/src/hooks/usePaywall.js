import { useSubscription } from './useSubscription';

export const usePaywall = () => {
  const { subscription, usage, isLoading } = useSubscription();

  // Vérifier si une fonctionnalité est accessible selon le plan.
  // Le chat IA unifié n'est pas gaté par plan : il est régulé par le quota quotidien de tokens.
  const canAccessFeature = (feature) => {
    if (isLoading || !subscription) {
      return false;
    }

    const currentPlan = subscription.planType || 'FREE';

    switch (feature) {
      case 'CREATE_PROGRAMME':
        // Vérifier limite de programmes selon le plan
        const limits = {
          'FREE': 0,      // Aucun programme avec IA
          'DECLIC': 1,
          'PRATIQUE': 5,
          'PIONNIER': Infinity,
          'EXPERT': Infinity
        };
        return usage.activeProgrammes < limits[currentPlan];

      case 'AI_ADMINISTRATIF':
        // Génération de bilans par IA
        return ['PRATIQUE', 'PIONNIER', 'EXPERT'].includes(currentPlan);

      case 'TEMPLATES_ADMIN':
        // Module administratif (courriers, templates)
        return ['PIONNIER', 'EXPERT'].includes(currentPlan);

      default:
        return false;
    }
  };

  return {
    canAccessFeature,
    subscription,
    usage,
    isLoading
  };
};
