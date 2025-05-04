import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
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
         pathname: '/**', // Allow any path on picsum.photos
       },
        // Add other trusted image domains here if needed
     ],
   },
};

export default nextConfig;
