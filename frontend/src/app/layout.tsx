import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider } from '@/components/ThemeProvider';
import { UserProvider } from '@/context/UserContext'; // ✅ Import du contexte utilisateur

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Mon Assistant Kiné',
  description: 'Application pour kinésithérapeutes — programmes d\'exercices personnalisés et IA',
  manifest: '/manifest.json',
  themeColor: '#4a9a8e',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Assistant Kiné',
  },
  icons: {
    apple: '/Logo192.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={cn(
          'min-h-screen bg-background font-sans antialiased text-foreground',
          inter.variable
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <UserProvider> {/* ✅ Contexte utilisateur ajouté ici */}
            {children}
            <Toaster />
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
