// src/components/patient/ProgramHeader.tsx
'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { CalendarDays, Target, Sparkles } from 'lucide-react'; // Icons for date, objective, motivation
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ProgramHeaderProps {
  currentDate: Date;
  longTermObjective?: string;
}

// Simple array of motivational quotes
const motivationalQuotes = [
  "Chaque petit pas compte.",
  "La persévérance est la clé du succès.",
  "Vous êtes plus fort que vous ne le pensez.",
  "Croyez en votre capacité à guérir et à progresser.",
  "La régularité paie toujours.",
  "Concentrez-vous sur le progrès, pas la perfection.",
  "Votre corps est capable de grandes choses.",
];

const getRandomQuote = () => {
    const randomIndex = Math.floor(Math.random() * motivationalQuotes.length);
    return motivationalQuotes[randomIndex];
};

export default function ProgramHeader({ currentDate, longTermObjective }: ProgramHeaderProps) {
  const formattedDate = format(currentDate, 'EEEE d MMMM yyyy', { locale: fr });
  const motivationalQuote = getRandomQuote();

  return (
    <Card className="shadow-lg border-border mb-8 bg-gradient-to-r from-primary/10 via-secondary/10 to-background">
      <CardHeader className="p-4 md:p-6 space-y-3">
        {/* Date */}
        <div className="flex items-center gap-3 text-muted-foreground">
          <CalendarDays className="h-5 w-5 text-accent" />
          <span className="text-lg font-medium capitalize">{formattedDate}</span>
        </div>

        {/* Motivational Quote */}
        <div className="flex items-center gap-3 text-primary italic">
          <Sparkles className="h-5 w-5 text-accent" />
          <p className="text-md">&ldquo;{motivationalQuote}&rdquo;</p>
        </div>

        {/* Long-Term Objective */}
        {longTermObjective && (
          <div className="flex items-center gap-3 text-muted-foreground pt-2 border-t border-border/50">
            <Target className="h-5 w-5 text-accent" />
             <div>
                <CardTitle className="text-base font-semibold text-primary">Votre objectif à long terme :</CardTitle>
                <CardDescription className="text-base text-foreground">{longTermObjective}</CardDescription>
            </div>
          </div>
        )}
      </CardHeader>
    </Card>
  );
}
