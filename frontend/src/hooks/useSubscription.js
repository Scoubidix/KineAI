import { useState, useEffect } from 'react';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

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

  const fetchSubscription = async (user) => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    try {
      const token = await user.getIdToken();
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      // Récupérer abonnement et usage en parallèle
      const [subscriptionResponse, usageResponse] = await Promise.all([
        fetch(`${API_URL}/api/kine/subscription`, { headers }),
        fetch(`${API_URL}/api/kine/usage`, { headers })
      ]);

      if (subscriptionResponse.ok) {
        const subscriptionData = await subscriptionResponse.json();
        setSubscription(subscriptionData.subscription);
      }

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
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await fetchSubscription(user);
      } else {
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const refreshSubscription = () => {
    const user = getAuth().currentUser;
    if (user) {
      fetchSubscription(user);
    }
  };

  return {
    subscription,
    usage,
    isLoading,
    error,
    refreshSubscription
  };
};