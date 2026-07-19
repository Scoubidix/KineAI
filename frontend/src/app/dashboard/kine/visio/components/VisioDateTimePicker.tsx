'use client';

import { useCallback, useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { format, startOfDay } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft } from 'lucide-react';

// Créneaux horaires proposés (07:00 → 22:00, pas de 15 min)
const TIME_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 7; h <= 22; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === 22 && m > 0) break;
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return out;
})();

// Parse une valeur "YYYY-MM-DDTHH:mm" (heure locale) en { date, time }.
function parseValue(value: string): { date: Date | undefined; time: string } {
  if (!value) return { date: undefined, time: '' };
  const [datePart, timePart] = value.split('T');
  const d = new Date(`${datePart}T${timePart || '00:00'}`);
  if (Number.isNaN(d.getTime())) return { date: undefined, time: '' };
  return { date: startOfDay(d), time: timePart ? timePart.slice(0, 5) : '' };
}

interface VisioDateTimePickerProps {
  /** Valeur initiale "YYYY-MM-DDTHH:mm" (l'état interne est ré-initialisé au montage). */
  initialValue?: string;
  /** Appelé avec "YYYY-MM-DDTHH:mm" quand jour ET créneau sont choisis, sinon ''. */
  onChange: (value: string) => void;
}

/**
 * Sélecteur date + créneau horaire, en deux vues animées :
 * 1) calendrier (choix du jour) → 2) grille de créneaux (choix de l'heure).
 * Partagé par la création et la reprogrammation d'un RDV visio.
 */
export default function VisioDateTimePicker({ initialValue = '', onChange }: VisioDateTimePickerProps) {
  const init = parseValue(initialValue);
  const [pickedDate, setPickedDate] = useState<Date | undefined>(init.date);
  const [pickedTime, setPickedTime] = useState<string>(init.time);
  const [view, setView] = useState<'calendar' | 'slots'>(init.date ? 'slots' : 'calendar');

  const emit = useCallback(
    (date: Date | undefined, time: string) => {
      if (!date || !time) return onChange('');
      onChange(`${format(date, 'yyyy-MM-dd')}T${time}`);
    },
    [onChange]
  );

  const slotIsPast = (date: Date | undefined, time: string) => {
    if (!date) return false;
    const [h, m] = time.split(':').map(Number);
    const dt = new Date(date);
    dt.setHours(h, m, 0, 0);
    return dt.getTime() < Date.now();
  };

  return (
    <div className="min-h-[360px]">
      {view === 'calendar' ? (
        <div
          key="calendar"
          className="flex justify-center duration-200 animate-in fade-in slide-in-from-left-4"
        >
          <Calendar
            mode="single"
            selected={pickedDate}
            onSelect={(d) => {
              if (!d) return;
              setPickedDate(d);
              setPickedTime(''); // change de jour → force un nouveau choix de créneau
              setView('slots');
              emit(d, ''); // incomplet → pas d'auto-avance tant qu'aucun créneau
            }}
            disabled={{ before: startOfDay(new Date()) }}
            locale={fr}
            className="rounded-md border"
          />
        </div>
      ) : (
        <div key="slots" className="space-y-3 duration-200 animate-in fade-in slide-in-from-right-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setView('calendar')}
              className="flex items-center gap-1 text-sm font-medium text-[#3899aa] hover:underline"
            >
              <ChevronLeft className="h-4 w-4" />
              Changer la date
            </button>
            {pickedDate && (
              <span className="text-sm capitalize text-muted-foreground">
                {format(pickedDate, 'EEEE d MMMM', { locale: fr })}
              </span>
            )}
          </div>

          <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto pr-1">
            {TIME_SLOTS.map((t) => {
              const past = slotIsPast(pickedDate, t);
              const active = pickedTime === t;
              return (
                <button
                  key={t}
                  type="button"
                  disabled={past}
                  onClick={() => {
                    setPickedTime(t);
                    emit(pickedDate, t);
                  }}
                  className={`rounded-md border py-1.5 text-sm transition-colors ${
                    active
                      ? 'border-[#3899aa] bg-[#3899aa]/10 font-medium text-[#3899aa]'
                      : past
                      ? 'cursor-not-allowed opacity-40'
                      : 'hover:border-[#3899aa]/50'
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
