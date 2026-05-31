'use client';

import { useAuthGuard } from '@/hooks/useAuthGuard';
import OnboardingWizard from './components/OnboardingWizard';

export default function OnboardingPage() {
  const status = useAuthGuard('kine');

  // Tant que le guard n'a pas confirmé l'auth, on affiche un loader.
  // Si l'utilisateur arrive ici alors qu'il a déjà nom+prénom remplis,
  // useAuthGuard le redirige vers /dashboard/kine/home.
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-teal-600 rounded-full animate-spin" />
      </div>
    );
  }

  return <OnboardingWizard />;
}
