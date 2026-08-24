'use client';

import React from 'react';

export type QuickActionsTab = 'exercices' | 'templates' | 'programmes';

interface QuickActionsProps {
  tab: QuickActionsTab;
  onCreateExercice: () => void;
  onCreateTemplate: () => void;
  onCreateProgramme: () => void;
}

export function QuickActions({
  tab,
  onCreateExercice,
  onCreateTemplate,
  onCreateProgramme,
}: QuickActionsProps) {
  // La 1re card suit l'onglet actif, la 2e est constante.
  const first =
    tab === 'templates'
      ? {
          emoji: '🧩',
          bg: '#eff6ff',
          title: 'Créer un template',
          onClick: onCreateTemplate,
        }
      : {
          emoji: '🏋️',
          bg: '#fffbeb',
          title: 'Créer un exercice',
          onClick: onCreateExercice,
        };

  const actions = [
    first,
    {
      emoji: '📅',
      bg: '#ecfdf5',
      title: 'Créer un programme',
      onClick: onCreateProgramme,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 max-w-md">
      {actions.map((action) => (
        <button
          key={action.title}
          onClick={action.onClick}
          className="card-hover rounded-xl p-4 text-center transition-all"
        >
          <div
            className="w-10 h-10 mx-auto mb-2 rounded-lg flex items-center justify-center text-xl"
            style={{ background: action.bg }}
          >
            {action.emoji}
          </div>
          <div className="text-sm font-semibold">{action.title}</div>
        </button>
      ))}
    </div>
  );
}
