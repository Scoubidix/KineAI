// Réponses de GET /api/kine/subscription et GET /api/kine/usage (backend/routes/subscription.js)

export type PlanType = 'FREE' | 'DECLIC' | 'PRATIQUE' | 'PIONNIER' | 'EXPERT';

export type BillingCycle = 'monthly' | 'yearly';

/** Changement d'abonnement programmé (downgrade différé), cf. StripeService.getScheduledChange */
export interface PendingPlanChange {
  planType: PlanType;
  billingCycle: BillingCycle;
  effectiveDate: string | null;
}

export interface Subscription {
  planType: PlanType | null;
  billingCycle: BillingCycle;
  /** Statut Stripe brut (active, trialing, past_due…) */
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  isTrialing: boolean;
  trialEndDate: string | null;
  daysLeft: number;
  canStartTrial: boolean;
  /** Présent uniquement avec un abonnement Stripe */
  pendingChange?: PendingPlanChange | null;
}

export interface Usage {
  activeProgrammes: number;
  totalProgrammes: number;
  monthlyMessages: number;
  totalPatients: number;
  lastUpdated?: string;
}
