import { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL;

export const useSubscription = () => {
  const [subscription, setSubscription] = useState(null);
  const [usage, setUsage] = useState({
    activeProgrammes: 0,
    totalProgrammes: 0,
    monthlyMessages: 0,
    totalPatients: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSubscription = async () => {
    const user = getAuth().currentUser;
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      
      // Récupérer les infos d'abonnement
      const subscriptionResponse = await fetch(`${API_URL}/api/kine/subscription`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (subscriptionResponse.ok) {
        const subscriptionData = await subscriptionResponse.json();
        setSubscription(subscriptionData.subscription);
      }

      // Récupérer l'usage
      const usageResponse = await fetch(`${API_URL}/api/kine/usage`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (usageResponse.ok) {
        const usageData = await usageResponse.json();
        setUsage(usageData);
      }

      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Erreur récupération abonnement:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const user = getAuth().currentUser;
    if (user) {
      fetchSubscription();
    } else {
      setIsLoading(false);
    }
  }, []);

  const refreshSubscription = () => {
    fetchSubscription();
  };

  return {
    subscription,
    usage,
    isLoading,
    error,
    refreshSubscription
  };
};