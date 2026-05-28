'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Sparkles, Rocket, Info, Gift, ArrowRight } from 'lucide-react';
import {
  ANNOUNCEMENTS,
  type Announcement,
  type AnnouncementIcon,
  type AnnouncementVariant,
} from '@/config/announcements';

const STORAGE_KEY = 'mak.dismissedAnnouncements';

const ICON_MAP: Record<AnnouncementIcon, React.ComponentType<{ className?: string }>> = {
  sparkles: Sparkles,
  rocket: Rocket,
  info: Info,
  gift: Gift,
};

const VARIANT_STYLES: Record<AnnouncementVariant, { wrapper: string; iconBg: string; cta: string }> = {
  feature: {
    wrapper:
      'border-[#3899aa]/30 bg-gradient-to-r from-[#eef7f6] to-white dark:from-[#3899aa]/10 dark:to-transparent',
    iconBg: 'bg-gradient-to-br from-[#3899aa] to-[#2a7a8a]',
    cta: 'text-[#3899aa]',
  },
  maintenance: {
    wrapper: 'border-amber-400/40 bg-amber-50 dark:bg-amber-950/20',
    iconBg: 'bg-amber-500',
    cta: 'text-amber-700 dark:text-amber-300',
  },
  promo: {
    wrapper: 'border-purple-400/40 bg-purple-50 dark:bg-purple-950/20',
    iconBg: 'bg-gradient-to-br from-purple-500 to-purple-700',
    cta: 'text-purple-700 dark:text-purple-300',
  },
};

function getDismissed(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function persistDismissed(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* localStorage indisponible — on accepte la perte */
  }
}

function pickActive(): Announcement | null {
  const dismissed = new Set(getDismissed());
  const now = Date.now();
  const active = ANNOUNCEMENTS.filter((a) => !dismissed.has(a.id))
    .filter((a) => !a.expiresAt || new Date(a.expiresAt).getTime() > now)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  return active[0] || null;
}

export default function AnnouncementBanner() {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  useEffect(() => {
    setAnnouncement(pickActive());
  }, []);

  if (!announcement) return null;

  const handleClose = () => {
    persistDismissed([...getDismissed(), announcement.id]);
    setAnnouncement(null);
  };

  const Icon = ICON_MAP[announcement.icon || 'sparkles'];
  const styles = VARIANT_STYLES[announcement.variant || 'feature'];

  return (
    <div className={`mb-6 rounded-xl border shadow-sm ${styles.wrapper}`}>
      <div className="flex items-start gap-3 p-4">
        <div
          className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white shadow-sm ${styles.iconBg}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight">{announcement.title}</p>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{announcement.description}</p>
          {announcement.cta && (
            <Link
              href={announcement.cta.href}
              onClick={handleClose}
              className={`mt-2 inline-flex items-center gap-1 text-sm font-medium hover:underline ${styles.cta}`}
            >
              {announcement.cta.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Fermer l'annonce"
          className="shrink-0 -mt-1 -mr-1 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
