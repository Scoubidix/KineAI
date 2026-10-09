import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Rien de ce qui vient d'une autre origine n'est mis en cache par le SW.
    // `defaultCache` se termine par une règle NetworkFirst attrape-tout pour le
    // cross-origin (cache "cross-origin", 1 h) qui captait :
    // - l'API (autre origine que le front) : réponses authentifiées (patients,
    //   bilans) écrites sur le disque malgré `Cache-Control: no-store` (ignoré
    //   par la Cache API), et resservies hors ligne quel que soit le compte
    //   connecté, la clé de cache étant l'URL seule ;
    // - le stockage média (GCS, Cellar, redirection `/api/media/…`) : vidéos
    //   en Range Requests mises en cache comme réponses opaques (~7 Mo de quota
    //   chacune), sans jamais de hit puisque chaque URL signée est unique.
    // NetworkOnly refait la requête en fetch() : chaque domaine appelé doit
    // figurer dans `connect-src` (CSP, next.config.ts).
    {
      matcher: ({ sameOrigin }) => !sameOrigin,
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
});

// Purge le cache "cross-origin" rempli par les versions précédentes du SW
// (réponses API authentifiées).
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.delete("cross-origin"));
});

serwist.addEventListeners();
