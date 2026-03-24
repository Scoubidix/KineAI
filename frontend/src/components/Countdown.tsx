"use client";

import { useEffect, useState } from "react";

const LAUNCH_DATE = new Date("2026-04-22T20:30:00+02:00").getTime();

interface TimeLeft {
  jours: number;
  heures: number;
  minutes: number;
  secondes: number;
}

function getTimeLeft(): TimeLeft | null {
  const diff = LAUNCH_DATE - Date.now();
  if (diff <= 0) return null;
  return {
    jours: Math.floor(diff / (1000 * 60 * 60 * 24)),
    heures: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    secondes: Math.floor((diff / 1000) % 60),
  };
}

export default function Countdown() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTimeLeft(getTimeLeft());
    setMounted(true);
    const id = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!mounted) {
    return <div className="h-[88px]" />;
  }

  if (!timeLeft) {
    return (
      <p className="text-xl font-semibold text-[hsl(190,50%,35%)] dark:text-[hsl(190,60%,65%)]">
        C&apos;est parti !
      </p>
    );
  }

  const units = [
    { label: "jours", value: timeLeft.jours },
    { label: "heures", value: timeLeft.heures },
    { label: "min", value: timeLeft.minutes },
    { label: "sec", value: timeLeft.secondes },
  ];

  return (
    <div className="flex gap-3 sm:gap-5">
      {units.map(({ label, value }) => (
        <div key={label} className="flex flex-col items-center">
          <span className="text-3xl sm:text-4xl font-bold tabular-nums text-[hsl(190,50%,30%)] dark:text-[hsl(190,60%,70%)]">
            {String(value).padStart(2, "0")}
          </span>
          <span className="text-xs uppercase tracking-widest text-[hsl(215,20%,50%)] dark:text-[hsl(210,40%,60%)] mt-1">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
