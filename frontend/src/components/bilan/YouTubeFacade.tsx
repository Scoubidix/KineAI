'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { youtubeEmbedUrl, youtubeThumbnailUrl } from '@/utils/youtube';

interface YouTubeFacadeProps {
  videoId: string;
  start: number | null;
  /** Nom du test : titre de l'iframe et libellé du bouton de lecture */
  title: string;
}

/**
 * Pattern « facade » (cf. lite-youtube-embed) : vignette + ▶, le lecteur YouTube n'est chargé
 * qu'au clic ; seule la vignette (i.ytimg.com, sans cookie) est chargée à l'ouverture de la fiche.
 * youtube-nocookie = mode confidentialité renforcée. Ne jamais poser referrerPolicy="no-referrer" :
 * YouTube refuse alors l'embed (erreur 153).
 */
export default function YouTubeFacade({ videoId, start, title }: YouTubeFacadeProps) {
  const [playing, setPlaying] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  return (
    <div>
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted">
        {playing ? (
          <iframe
            src={youtubeEmbedUrl(videoId, start)}
            title={title}
            className="absolute inset-0 h-full w-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Lire la vidéo : ${title}`}
            className="group absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {!thumbFailed && (
              <img
                src={youtubeThumbnailUrl(videoId)}
                alt=""
                onError={() => setThumbFailed(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <span className="relative flex h-12 w-16 items-center justify-center rounded-xl bg-black/70 text-white transition-colors group-hover:bg-[#3899aa]">
              <Play className="h-6 w-6 fill-current" />
            </span>
          </button>
        )}
      </div>
      {/* Information préalable au clic (chargement au clic, recommandations CNIL) : le clic vaut consentement */}
      {!playing && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Vidéo hébergée par YouTube : la lecture peut déposer des cookies de YouTube.{' '}
          <a href="/legal/politique-confidentialite.html" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
            En savoir plus
          </a>
        </p>
      )}
    </div>
  );
}
