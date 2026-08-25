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
    // Le stockage média (vidéos MP4 + posters GCS) ne doit jamais passer par le
    // SW : `defaultCache` se termine par une règle NetworkFirst attrape-tout
    // pour le cross-origin (cache "cross-origin"), qui capterait aussi GCS.
    // Les vidéos font des Range Requests ; sans `crossorigin`, elles partent en
    // `no-cors` et le SW les mettrait en cache comme réponses opaques —
    // ~7 Mo réservés au quota par réponse, sans même de RangeRequestsPlugin, et
    // sans jamais de hit puisque chaque URL signée est unique. GCS gère déjà
    // son propre cache-control ; NetworkOnly court-circuite le SW entièrement.
    { matcher: ({ url }) => url.hostname === 'storage.googleapis.com', handler: new NetworkOnly() },
    ...defaultCache,
  ],
});

serwist.addEventListeners();
