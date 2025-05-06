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
    return 'kine';
  }
  if (path.startsWith('/dashboard/patient')) {
    return 'patient';
  }
  if (path === '/') {
    return 'unknown';
  }
  if (process.env.NODE_ENV === 'development') {
    if (path.includes('/kine')) return 'kine';
    if (path.includes('/patient')) return 'patient';
  }
  return 'unknown';
};

export default function AppLayout({ children }: AppLayoutProps) {
  const currentPathname = usePathname();
  const router = useRouter();
  const role: RoleOrUnknown = getRoleFromPath(currentPathname);
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
      console.log('✅ Utilisateur déconnecté.');
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

  if (role === 'unknown') {
    return <>{children}</>;
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <Sidebar collapsible="icon" side="left" variant="sidebar" className="bg-sidebar text-sidebar-foreground">
        <SidebarHeader className="items-center gap-2 border-b border-sidebar-border">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-accent group-data-[state=collapsed]:h-7 group-data-[state=collapsed]:w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 1 0 10 10h-1.1"/>
            <path d="M18 18.5V13a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1v5.5"/>
            <path d="M14 13.5V12a1 1 0 0 0-1-1h-2a1 1 0 0 0-1 1v1.5"/>
            <path d="M12 12v10"/>
            <path d="m8 16 1.5-1 1.5 1"/>
            <path d="m13 16 1.5-1 1.5 1"/>
            <path d="M9 8h6"/>
            <path d="M9 6h6"/>
          </svg>
          <span className="text-lg font-semibold text-primary group-data-[state=collapsed]:hidden">
            KineAI <span className="text-xs text-muted-foreground ml-1">(Dev)</span>
          </span>
          <SidebarTrigger className="ml-auto md:hidden" tooltip="Ouvrir/Fermer le menu"/>
        </SidebarHeader>
        <SidebarContent className="p-2">
          <SidebarMenu>
            {navigationItems.map((item) => (
              <SidebarMenuItem key={item.href}>
                <Link href={item.href} passHref legacyBehavior>
                  <SidebarMenuButton
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
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            ))}
            {role !== 'unknown' && (
              <SidebarMenuItem>
                <Link href={role === 'kine' ? '/dashboard/patient/home' : '/dashboard/kine/home'} passHref legacyBehavior>
                  <SidebarMenuButton
                    tooltip={role === 'kine' ? 'Vue Patient (Dev)' : 'Vue Kiné (Dev)'}
                    className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    {role === 'kine' ? <ClipboardList className="h-4 w-4 shrink-0"/> : <Users className="h-4 w-4 shrink-0"/>}
                    <span>{role === 'kine' ? 'Vue Patient (Dev)' : 'Vue Kiné (Dev)'}</span>
                  </SidebarMenuButton>
                </Link>
              </SidebarMenuItem>
            )}
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
              <SidebarMenuButton tooltip="Compte (Dev)" className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
                <Avatar className="h-6 w-6 group-data-[state=collapsed]:h-6 group-data-[state=collapsed]:w-6">
                  <AvatarFallback className="text-xs bg-secondary text-secondary-foreground">
                    {displayInitials}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate max-w-[100px]">{displayName}</span>
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
        <div className="relative p-4 md:p-6 lg:p-8 bg-background text-foreground min-h-screen">
          <div className="absolute top-4 right-4 md:top-6 md:right-6 z-50">
            <ThemeToggle />
          </div>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
