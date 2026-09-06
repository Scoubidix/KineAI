'use client';
import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RefreshCw } from 'lucide-react';
import type { BilanSectionKey } from '@/types/bilan';

interface SectionCardProps { sectionKey: BilanSectionKey; title: string; text: string; onChange: (text: string) => void; disabled?: boolean }

export default function SectionCard({ sectionKey, title, text, onChange, disabled }: SectionCardProps) {
  const empty = text.trim() === '';
  return (
    <section className={`rounded-lg border ${empty ? 'border-border/40' : 'border-border/70'} bg-white dark:bg-card`} aria-labelledby={`section-${sectionKey}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
        <h3 id={`section-${sectionKey}`} className={`text-sm font-semibold ${empty ? 'text-muted-foreground' : ''}`}>{title}{empty && <span className="ml-2 text-[10px] font-normal">· vide</span>}</h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild><span><Button variant="ghost" size="sm" disabled aria-label="Régénérer cette section" className="h-7 w-7 p-0"><RefreshCw className="h-3.5 w-3.5" /></Button></span></TooltipTrigger>
            <TooltipContent>Disponible avec la rédaction IA</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <Textarea value={text} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder="Rédige ici ou laisse vide (la section ne sera pas imprimée)" className="min-h-[72px] border-0 rounded-none rounded-b-lg text-sm leading-relaxed resize-y focus-visible:ring-0" />
    </section>
  );
}
