'use client';

import React from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Settings, BarChart2, Home, Users, DollarSign, Bell, ClipboardList, LogOut, Library, Dumbbell, Briefcase, Share2, Wand2, Gift, Newspaper, ClipboardCheck, FileText, ShoppingBag } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { RoleOrUnknown } from '@/types/user';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Loader2 } from 'lucide-react';
import { getAuth, signOut } from 'firebase/auth';
import { app } from '@/lib/firebase/config';

interface AppLayoutProps {
  children: React.ReactNode;
}

const getRoleFromPath = (path: string): RoleOrUnknown => {
  if (path.startsWith('/dashboard/kine')) {
    return 'kine' as const;
  }
  if (path.startsWith('/dashboard/patient')) {
    return 'patient' as const;
  }
  if (path === '/') {
    return 'unknown' as const;
  }
  if (process.env.NODE_ENV === 'development') {
    if (path.includes('/kine')) return 'kine' as const;
    if (path.includes('/patient')) return 'patient' as const;
  }
  return 'unknown' as const;
};

export default function AppLayout({ children }: AppLayoutProps) {
  const currentPathname = usePathname();
  const router = useRouter();
  const role = getRoleFromPath(currentPathname);
  const [loading, setLoading] = React.useState(false);

  const getNavigationItems = () => {
    if (role === 'kine') {
      return [
        { href: '/dashboard/kine/home', label: 'Accueil Kiné', icon: Home, disabled: false },
        { href: '/dashboard/kine/notifications', label: 'Notifications', icon: Bell, disabled: false },
        { href: '/dashboard/kine/patients', label: 'Patients & Programmes', icon: Users, disabled: false },
        { href: '/dashboard/kine/chatbot', label: 'Assistant IA Kiné', icon: Wand2, disabled: false },
        { href: '/dashboard/kine/analytics', label: 'Statistiques', icon: BarChart2, disabled: false },
        { href: '/dashboard/kine/create-exercise', label: 'Créer Exercice (Bientôt)', icon: Dumbbell, disabled: false },
        { href: '/dashboard/kine/public-programs', label: 'Programmes Publics (Bientôt)', icon: Share2, disabled: false },
        { href: '/dashboard/kine/blog', label: 'Blog Pro (Bientôt)', icon: Library, disabled: false },
        { href: '/dashboard/kine/jobs', label: 'Annonces Emploi (Bientôt)', icon: Briefcase, disabled: false },
        { href: '/dashboard/kine/revenue', label: 'Revenus (Bientôt)', icon: DollarSign, disabled: false },
        { href: '/dashboard/kine/rewards', label: 'Mes Récompenses (Bientôt)', icon: Gift, disabled: false },
      ];
    } else if (role === 'patient') {
      return [
        { href: '/dashboard/patient/home', label: 'Mon Dashboard', icon: ClipboardList, disabled: false },
        { href: '/dashboard/patient/chat', label: 'Coach IA', icon: Wand2, disabled: false },
        { href: '/dashboard/patient/programs', label: 'Programmes (Bientôt)', icon: ShoppingBag, disabled: false },
        { href: '/dashboard/patient/articles', label: 'Articles (Bientôt)', icon: Newspaper, disabled: false },
        { href: '/dashboard/patient/tests', label: 'Tests (Bientôt)', icon: ClipboardCheck, disabled: false },
        { href: '/dashboard/patient/medical-reports', label: 'Rapports Médicaux (Bientôt)', icon: FileText, disabled: false },
      ];
    }
    return [
      { href: '/dashboard/kine/home', label: 'Accès Kiné (Dev)', icon: Users, disabled: false },
      { href: '/dashboard/patient/home', label: 'Accès Patient (Dev)', icon: ClipboardList, disabled: false },
    ];
  };

  const navigationItems = getNavigationItems();
  const displayName = role === 'kine' ? 'Dr. Kiné (Dev)' : role === 'patient' ? 'Patient (Dev)' : 'Utilisateur (Dev)';
  const displayInitials = role === 'kine' ? 'DK' : role === 'patient' ? 'PA' : 'U';

  const handleLogout = async () => {
    try {
      const auth = getAuth(app);
      await signOut(auth);
      router.replace('/login');
    } catch (error) {
      console.error('❌ Erreur de déconnexion Firebase :', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-accent" />
      </div>
    );
  }

  if (role !== 'kine' && role !== 'patient') {
    return <>{children}</>;
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar collapsible="icon" side="left" variant="sidebar" className="bg-sidebar text-sidebar-foreground">
        <SidebarHeader className="items-center gap-2 border-b border-sidebar-border">
          <img 
            src="/logo.jpg" 
            alt="Mon Assistant Kiné" 
            className="h-7 w-7 rounded-md object-contain group-data-[state=collapsed]:h-7 group-data-[state=collapsed]:w-7" 
          />
          <span className="text-lg font-semibold text-primary group-data-[state=collapsed]:hidden">
            Mon Assistant Kiné
          </span>
          <SidebarTrigger className="ml-auto" />
        </SidebarHeader>
        <SidebarContent className="p-2">
          <SidebarMenu>
            {navigationItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.label}
                  isActive={
                    currentPathname === item.href ||
                    (item.href !== '/' && !item.href.endsWith('/home') && currentPathname.startsWith(item.href)) ||
                    (item.href.endsWith('/home') && currentPathname === item.href)
                  }
                  disabled={item.disabled && item.label.includes('(Bientôt)')}
                  aria-disabled={item.disabled && !item.label.includes('(Bientôt)')}
                  className={item.disabled && !item.label.includes('(Bientôt)') ? "text-muted-foreground cursor-not-allowed opacity-60" : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground"}
                >
                  <Link href={item.href}>
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarContent>
        <SidebarFooter className="border-t border-sidebar-border p-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Paramètres (Bientôt)" disabled className="text-muted-foreground cursor-not-allowed opacity-60">
                <Settings className="h-4 w-4 shrink-0" />
                <span>Paramètres</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Déconnexion" onClick={handleLogout} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                <LogOut className="h-4 w-4 shrink-0" />
                <span>Déconnexion</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        {/* Barre de navigation mobile TOUJOURS visible */}
        <div className="sticky top-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border lg:hidden">
          <div className="flex h-14 items-center px-4">
            <SidebarTrigger className="mr-2" />
            <div className="flex items-center gap-2">
              <img 
                src="/logo.jpg" 
                alt="Mon Assistant Kiné" 
                className="h-6 w-6 rounded-md object-contain" 
              />
              <span className="font-semibold text-primary">Mon Assistant Kiné</span>
            </div>
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </div>
        </div>

        {/* Contenu principal */}
        <div className="relative p-4 md:p-6 lg:p-8 bg-background text-foreground min-h-screen">
          {/* ThemeToggle pour desktop uniquement */}
          <div className="absolute top-4 right-4 md:top-6 md:right-6 z-40 hidden lg:block">
            <ThemeToggle />
          </div>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}