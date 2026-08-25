import withSerwistInit from "@serwist/next";
import type {NextConfig} from 'next';

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
});

// Extraire l'origin de l'URL API backend pour le CSP
const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
let apiOrigin = '';
try {
  apiOrigin = new URL(apiUrl).origin;
} catch {
  apiOrigin = 'http://localhost:3000';
}

// Origine WebSocket du signaling visio (Socket.IO) : ws:// en dev, wss:// en prod.
// http -> ws, https -> wss (le /^http/ transforme aussi "https" en "wss").
const wsOrigin = apiOrigin.replace(/^http/, 'ws');

const isDev = process.env.NODE_ENV === 'development';

// Content-Security-Policy : whitelist des domaines autorises dans le navigateur
const csp = [
  "default-src 'self'",
  // Scripts : 'unsafe-inline' requis par Next.js (hydratation), 'unsafe-eval' en dev uniquement (HMR)
  // www.googletagmanager.com : Google Analytics 4 (mesure d'audience, soumis a consentement)
  isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com"
    : "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
  // Styles : 'unsafe-inline' requis par React inline styles + Tailwind
  "style-src 'self' 'unsafe-inline'",
  // Connexions API : backend + Firebase Auth + GCS + GA4
  `connect-src 'self' ${apiOrigin} ${wsOrigin} *.googleapis.com *.firebaseapp.com storage.googleapis.com https://www.google-analytics.com https://*.analytics.google.com https://*.google-analytics.com`,
  "worker-src 'self'",
  // Images : GCS (posters + GIFs legacy) + picsum (placeholder) + data: (SVG inline) + GA4 (pixels)
  "img-src 'self' data: blob: picsum.photos storage.googleapis.com www.google.com https://www.google-analytics.com",
  // Médias : les vidéos de démonstration sont servies par URL signée GCS. Sans
  // cette directive, <video> retombe sur default-src 'self' et est bloquée.
  "media-src 'self' blob: storage.googleapis.com",
  // Fonts : next/font auto-heberge au build, gstatic en fallback
  "font-src 'self' fonts.gstatic.com",
  // Frames : iframe autorise uniquement vers la meme origine + blob: (preview PDF contrats)
  "frame-src 'self' blob:",
  // Bloque les plugins (Flash, Java, etc.)
  "object-src 'none'",
  // Empeche le changement de base URL
  "base-uri 'self'",
].join('; ');

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/',
        destination: '/dashboard/kine/home',
        permanent: true,
      },
      {
        // La page "Mes Exercices" a fusionne dans la page Programmes (onglet Exercices).
        source: '/dashboard/kine/create-exercise',
        destination: '/dashboard/kine/programmes?tab=exercices',
        permanent: true,
      },
    ];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: csp,
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
