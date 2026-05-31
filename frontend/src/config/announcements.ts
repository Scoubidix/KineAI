export type AnnouncementIcon = 'sparkles' | 'rocket' | 'info' | 'gift';
export type AnnouncementVariant = 'feature' | 'maintenance' | 'promo';

export interface Announcement {
  id: string; // Clé unique de dismissal — changer pour republier
  title: string;
  description: string;
  icon?: AnnouncementIcon;
  cta?: { label: string; href: string };
  publishedAt: string; // ISO date — la plus récente est affichée en priorité
  expiresAt?: string; // ISO date — masquée auto au-delà
  variant?: AnnouncementVariant;
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'contracts-module-2026-05-v2',
    title: 'Nouveau : Module Contrats',
    description:
      "Rédigez, signez électroniquement et déclarez vos contrats au Conseil de l'Ordre.",
    icon: 'sparkles',
    cta: { label: 'Découvrir le module', href: '/dashboard/kine/contrats' },
    publishedAt: '2026-05-28',
    variant: 'feature',
  },
];
