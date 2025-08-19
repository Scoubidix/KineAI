import { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const useCurrentUsage = () => {
  const [usage, setUsage] = useState({
    activeProgrammes: 0,
    totalProgrammes: 0,
    monthlyMessages: 0,
    totalPatients: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUsage = async () => {
    const user = getAuth().currentUser;
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const response = await fetch(`${API_URL}/api/kine/usage`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la récupération de l\'usage');
      }

      const data = await response.json();
      setUsage(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Erreur usage:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const user = getAuth().currentUser;
    if (user) {
      fetchUsage();
    } else {
      setIsLoading(false);
    }
  }, []);

  // Calculer le pourcentage d'usage pour les plans limités
  const getUsagePercentage = (planType) => {
    const limits = {
      'FREE': 0,
      'DECLIC': 1,
      'PRATIQUE': 3,
      'PIONNIER': Infinity,
      'EXPERT': Infinity
    };

    const limit = limits[planType];
    if (limit === Infinity || limit === 0) return 0;
    
    return Math.min((usage.activeProgrammes / limit) * 100, 100);
  };

  // Vérifier si proche de la limite
  const isNearLimit = (planType, threshold = 80) => {
    const percentage = getUsagePercentage(planType);
    return percentage >= threshold && percentage < 100;
  };

  // Vérifier si la limite est atteinte
  const isAtLimit = (planType) => {
    const limits = {
      'FREE': 0,
      'DECLIC': 1,
      'PRATIQUE': 3,
      'PIONNIER': Infinity,
      'EXPERT': Infinity
    };

    const limit = limits[planType];
    if (limit === Infinity) return false;
    
    return usage.activeProgrammes >= limit;
  };

  // Obtenir la limite pour un plan donné
  const getPlanLimit = (planType) => {
    const limits = {
      'FREE': 0,
      'DECLIC': 1,
      'PRATIQUE': 3,
      'PIONNIER': -1, // illimité
      'EXPERT': -1    // illimité
    };

    return limits[planType] || 0;
  };

  // Obtenir le nombre de programmes restants
  const getRemainingProgrammes = (planType) => {
    const limit = getPlanLimit(planType);
    if (limit === -1) return -1; // illimité
    
    return Math.max(0, limit - usage.activeProgrammes);
  };

  // Rafraîchir l'usage (utile après création/suppression)
  const refreshUsage = () => {
    fetchUsage();
  };

  // Rafraîchir via l'API (avec archivage automatique)
  const forceRefreshUsage = async () => {
    const user = getAuth().currentUser;
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch(`${API_URL}/api/kine/usage/refresh`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsage(prevUsage => ({
          ...prevUsage,
          activeProgrammes: data.activeProgrammes,
          totalProgrammes: data.totalProgrammes
        }));
      }
    } catch (err) {
      console.error('Erreur force refresh usage:', err);
    }
  };

  return {
    usage,
    isLoading,
    error,
    getUsagePercentage,
    isNearLimit,
    isAtLimit,
    getPlanLimit,
    getRemainingProgrammes,
    refreshUsage,
    forceRefreshUsage
  };
};