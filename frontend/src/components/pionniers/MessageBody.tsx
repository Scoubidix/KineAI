'use client';

import React from 'react';

// Decoupe le texte en segments ; le groupe capturant est conserve par split().
const SPLIT_ON_URL = /(https?:\/\/[^\s<]+)/g;
// Motif SANS le drapeau g : `test()` sur un regex global fait avancer lastIndex
// d'un appel a l'autre et renverrait un resultat sur deux.
const IS_URL = /^https?:\/\/[^\s<]+$/;

export default function MessageBody({ body }: { body: string }) {
  const segments = body.split(SPLIT_ON_URL);

  return (
    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
      {segments.map((segment, i) =>
        IS_URL.test(segment) ? (
          <a
            key={i}
            href={segment}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-[#3899aa] underline underline-offset-2 hover:opacity-80"
          >
            {segment}
          </a>
        ) : (
          <React.Fragment key={i}>{segment}</React.Fragment>
        )
      )}
    </p>
  );
}
