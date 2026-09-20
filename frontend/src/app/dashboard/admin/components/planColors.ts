// Couleurs badge par plan, partagées entre page.tsx (onglets Emails, Support) et
// StatsGlobalesTab.tsx (changements de plan, abonnements par plan).
export const PLAN_COLORS: Record<string, string> = {
  FREE: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  DECLIC: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  PRATIQUE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  PIONNIER: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  EXPERT: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
};
