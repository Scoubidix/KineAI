'use client';

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface RecapRow {
  label: string;
  value: string;
}

export interface RecapAction {
  label: string;
  icon?: React.ReactNode;
  /** L'action principale prend le bouton teal ; les autres sont en contour. */
  primary?: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** Libellé court pour la barre mobile ; à défaut, seule l'icône est rendue. */
  shortLabel?: string;
}

interface BuilderRecapProps {
  rows: RecapRow[];
  actions: RecapAction[];
  /** Résumé affiché à gauche de la barre mobile. */
  mobileSummary: string;
}

/** Panneau collant à droite en desktop, barre d'action fixe en bas sur mobile. */
export function BuilderRecap({ rows, actions, mobileSummary }: BuilderRecapProps) {
  return (
    <>
      <Card className="hidden lg:block lg:sticky lg:top-6">
        <CardContent className="pt-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Récapitulatif
          </p>
          <dl className="space-y-2 text-sm">
            {rows.map((row) => (
              <div key={row.label} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="font-medium text-right">{row.value}</dd>
              </div>
            ))}
          </dl>

          <div className="space-y-2 pt-2 border-t">
            {actions.map((action) => (
              <Button
                key={action.label}
                className={action.primary ? 'btn-teal w-full' : 'w-full'}
                variant={action.primary ? 'default' : 'outline'}
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div
        className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur px-4 pt-3"
        style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground flex-1">{mobileSummary}</span>
          {actions.map((action) => (
            <Button
              key={action.label}
              className={action.primary ? 'btn-teal' : ''}
              variant={action.primary ? 'default' : 'outline'}
              size="sm"
              disabled={action.disabled}
              onClick={action.onClick}
              aria-label={action.label}
            >
              {action.primary || action.shortLabel ? (
                <>
                  {action.icon}
                  {action.shortLabel ?? action.label}
                </>
              ) : (
                action.icon
              )}
            </Button>
          ))}
        </div>
      </div>
    </>
  );
}
