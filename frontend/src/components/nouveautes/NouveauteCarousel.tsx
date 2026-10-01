'use client';

import React, { useEffect, useState } from 'react';
import { ZoomIn } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

/**
 * Carrousel d'images des Nouveautés et des News : crossfade 4 s, pause au survol, zoom plein écran.
 */

export default function NouveauteCarousel({
  imageUrls,
  gradient,
  Icon,
}: {
  imageUrls: string[];
  gradient: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [zoomed, setZoomed] = useState<string | null>(null);
  const count = imageUrls.length;

  useEffect(() => {
    setIndex(0);
  }, [count]);

  useEffect(() => {
    if (count <= 1 || paused) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), 4000);
    return () => clearInterval(id);
  }, [count, paused]);

  if (count === 0) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient}`}>
        <Icon className="h-12 w-12 text-white/90" />
      </div>
    );
  }

  return (
    <>
      <div
        className="relative h-full w-full"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        {imageUrls.map((url, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={url}
            alt=""
            title="Cliquer pour agrandir"
            onClick={() => setZoomed(url)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-in-out ${
              i === index ? 'cursor-zoom-in opacity-100' : 'pointer-events-none opacity-0'
            }`}
          />
        ))}
        {/* Indice de zoom */}
        <span className="pointer-events-none absolute left-2 top-2 z-10 rounded-full bg-black/45 p-1 text-white opacity-80">
          <ZoomIn className="h-3.5 w-3.5" />
        </span>
        {count > 1 && (
          <div className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
            {imageUrls.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Image ${i + 1}`}
                className={`h-1.5 rounded-full bg-white transition-all ${
                  i === index ? 'w-4 opacity-100' : 'w-1.5 opacity-60'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox zoom (image entière, fermeture X / Échap / clic hors image) */}
      <Dialog open={!!zoomed} onOpenChange={(o) => !o && setZoomed(null)}>
        <DialogContent className="w-[96vw] max-w-6xl border-0 bg-transparent p-0 shadow-none">
          {zoomed && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={zoomed}
              alt=""
              className="mx-auto max-h-[90vh] w-auto rounded-lg object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
