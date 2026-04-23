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

const isDev = process.env.NODE_ENV === 'development';

// Content-Security-Policy : whitelist des domaines autorises dans le navigateur
const csp = [
  "default-src 'self'",
  // Scripts : 'unsafe-inline' requis par Next.js (hydratation), 'unsafe-eval' en dev uniquement (HMR)
  isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'",
  // Styles : 'unsafe-inline' requis par React inline styles + Tailwind
  "style-src 'self' 'unsafe-inline'",
  // Connexions API : backend + Firebase Auth + GCS
  `connect-src 'self' ${apiOrigin} *.googleapis.com *.firebaseapp.com storage.googleapis.com`,
  "worker-src 'self'",
  // Images : GCS (GIFs exercices) + picsum (placeholder) + data: (SVG inline)
  "img-src 'self' data: blob: picsum.photos storage.googleapis.com www.google.com",
  // Fonts : next/font auto-heberge au build, gstatic en fallback
  "font-src 'self' fonts.gstatic.com",
  // Frames : aucun iframe autorise
  "frame-src 'none'",
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
    ];
  },
  async rewrites() {
    return [
      {
        source: '/api-proxy/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*`,
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
