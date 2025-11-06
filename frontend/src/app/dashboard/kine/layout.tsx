// app/dashboard/kine/layout.tsx
'use client';

import { AuthGuard } from '@/components/AuthGuard';

export default function KineLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AuthGuard role="kine" />
      <div className="min-h-screen flex flex-col">
        <div className="flex-1">
          {children}
        </div>

        {/* Footer */}
        <footer className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto py-4">
            <div className="text-center text-xs text-muted-foreground space-y-1">
              <p>© {new Date().getFullYear()} Mon Assistant Kiné</p>
              <p>
                <a href="/legal/cgu.html" target="_blank" rel="noopener noreferrer" className="hover:underline">CGU</a>
                {" • "}
                <a href="/legal/politique-confidentialite.html" target="_blank" rel="noopener noreferrer" className="hover:underline">Politique de confidentialité</a>
                {" • "}
                <a href="/legal/mentions-legales.html" target="_blank" rel="noopener noreferrer" className="hover:underline">Mentions légales</a>
              </p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
