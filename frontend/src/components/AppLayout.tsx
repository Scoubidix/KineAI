'use client';

import React, { useState } from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { sendPasswordReset } from "@/lib/auth-utils";
import { useToast } from "@/hooks/use-toast"; // Test réactivé
import { useSubscription } from "@/hooks/useSubscription";
import { PLANS, getPlanByType } from "@/config/plans";
import { 
  Settings, 
  BarChart2, 
  Home, 
  Users, 
  DollarSign, 
  Bell, 
  ClipboardList, 
  LogOut, 
  Library, 
  Dumbbell, 
  Briefcase, 
  Share2, 
  Wand2, 
  Gift, 
  Newspaper, 
  ClipboardCheck, 
  FileText, 
  ShoppingBag, 
  Calendar,
  CalendarDays,
  User,
  Shield,
  Palette,
  Save,
  Download,
  Loader2,
  Trash2,
  Moon,
  Sun,
  Monitor,
  Clock,
  Globe,
  Database,
  CheckCircle,
  BookOpen,
  Stethoscope,
  CreditCard,
  Trophy,
  AlertCircle,
  Crown,
  MessageCircle,
  Camera
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { RoleOrUnknown } from '@/types/user';
import { getAuth, signOut } from 'firebase/auth';
import { app } from '@/lib/firebase/config';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { RGPDExportModal } from './RGPDExportModal';
import { RGPDDeleteModal } from './RGPDDeleteModal';
import { PaywallModal } from './PaywallModal';

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

// Composant Settings Modal
function SettingsModal({ trigger, open, onOpenChange }: { trigger?: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;
  const [activeTab, setActiveTab] = useState('account');
  const [showPassword, setShowPassword] = useState(false);
  const [dataRetention, setDataRetention] = useState('5-years');
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState(''); // Message de sauvegarde
  const [passwordResetLoading, setPasswordResetLoading] = useState(false); // Loading pour reset password
  const [passwordResetMessage, setPasswordResetMessage] = useState(''); // Message pour reset password
  const [kineData, setKineData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    rpps: '',
    adresseCabinet: '',
    birthDate: ''
  });

  // 🔒 NOUVEAU : États pour les modales RGPD
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  
  // 💳 États abonnement
  const [portalLoading, setPortalLoading] = useState(false);
  const [isPaywallModalOpen, setIsPaywallModalOpen] = useState(false);

  const { toast } = useToast();
  const { subscription, usage, isLoading: subscriptionLoading } = useSubscription();

  // Charger les données du kiné au montage
  React.useEffect(() => {
    if (isOpen) {
      fetchKineProfile();
    }
  }, [isOpen]);

  const fetchKineProfile = async () => {
    try {
      const auth = getAuth(app);
      const user = auth.currentUser;
      if (!user) {
        console.error('Utilisateur non connecté');
        return;
      }
      
      const token = await user.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/kine/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setKineData({
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          phone: data.phone || '',
          rpps: data.rpps || '',
          adresseCabinet: data.adresseCabinet || '',
          birthDate: data.birthDate || ''
        });
      } else {
        console.error('Erreur lors du chargement du profil');
        // Pas de message pour les erreurs de chargement
      }
    } catch (error) {
      console.error('Erreur lors du chargement du profil:', error);
      // Pas de message pour les erreurs de chargement
    }
  };

  const handleSaveProfile = async () => {
    // Validation RPPS : vide ou exactement 11 chiffres
    const rppsValue = kineData.rpps?.trim() || '';
    if (rppsValue && (rppsValue.length !== 11 || !/^\d{11}$/.test(rppsValue))) {
      setSaveMessage('❌ Le numéro RPPS doit contenir exactement 11 chiffres');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    // Validation téléphone : vide ou exactement 10 chiffres
    const phoneValue = kineData.phone?.replace(/\s/g, '') || '';
    if (phoneValue && (phoneValue.length !== 10 || !/^\d{10}$/.test(phoneValue))) {
      setSaveMessage('❌ Le numéro de téléphone doit contenir exactement 10 chiffres');
      setTimeout(() => setSaveMessage(''), 3000);
      return;
    }

    setLoading(true);
    try {
      const auth = getAuth(app);
      const user = auth.currentUser;
      if (!user) {
        console.error('Utilisateur non connecté');
        setSaveMessage('❌ Erreur : Vous devez être connecté');
        setTimeout(() => setSaveMessage(''), 3000);
        return;
      }
      
      const token = await user.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/kine/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          phone: kineData.phone,
          adresseCabinet: kineData.adresseCabinet,
          rpps: kineData.rpps?.trim() || null
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log('Profil mis à jour avec succès:', result);
        
        console.log('Profil mis à jour avec succès:', result);
        
        // Afficher le message de succès pendant 3 secondes
        setSaveMessage('✅ Profil mis à jour avec succès !');
        setTimeout(() => {
          setSaveMessage('');
        }, 3000);
        
        /* 
        // Version toast à réactiver une fois le Toaster configuré
        toast({
          title: "Profil mis à jour",
          description: "Vos informations ont été sauvegardées avec succès.",
          duration: 3000,
          className: "bg-green-50 border-green-200 text-green-800",
        });
        */
        
      } else {
        const error = await response.json();
        console.error('Erreur lors de la mise à jour:', error);
        setSaveMessage('❌ Erreur lors de la sauvegarde');
        setTimeout(() => setSaveMessage(''), 3000);
      }
    } catch (error) {
      console.error('Erreur:', error);
      setSaveMessage('❌ Erreur inattendue');
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setLoading(false);
    }
  };

  // Fonction pour envoyer un email de réinitialisation du mot de passe
  const handlePasswordReset = async () => {
    setPasswordResetLoading(true);
    
    try {
      const auth = getAuth(app);
      const user = auth.currentUser;
      
      if (!user?.email) {
        setPasswordResetMessage('❌ Erreur : Email non trouvé');
        setTimeout(() => setPasswordResetMessage(''), 3000);
        return;
      }

      // Utiliser la même fonction que la page forgot-password
      const result = await sendPasswordReset(user.email);

      if (result.success) {
        setPasswordResetMessage('✅ Email de réinitialisation envoyé !');
        setTimeout(() => setPasswordResetMessage(''), 3000);
      } else {
        setPasswordResetMessage('❌ Erreur lors de l\'envoi');
        setTimeout(() => setPasswordResetMessage(''), 3000);
      }

    } catch (error) {
      console.error('Erreur reset password:', error);
      setPasswordResetMessage('❌ Erreur inattendue');
      setTimeout(() => setPasswordResetMessage(''), 3000);
    } finally {
      setPasswordResetLoading(false);
    }
  };

  // Fonction pour changer le thème
  const handleThemeChange = (newTheme: string) => {
    const root = window.document.documentElement;
    
    if (newTheme === 'dark') {
      root.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else if (newTheme === 'light') {
      root.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else { // system
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      if (systemTheme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      localStorage.setItem('theme', 'system');
    }
  };

  // Charger le thème au montage
  React.useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'system';
    handleThemeChange(savedTheme);
  }, []);

  const handleOpenPortal = async () => {
    setPortalLoading(true);
    try {
      const auth = getAuth(app);
      const user = auth.currentUser;
      if (!user) return;

      const token = await user.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/stripe/create-portal`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/dashboard/kine/home`,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        window.open(data.url, '_blank');
      } else {
        const error = await response.json();
        toast({
          title: "Erreur",
          description: error.details || "Impossible d'ouvrir le portail de facturation.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Erreur portail Stripe:', error);
      toast({
        title: "Erreur",
        description: "Impossible d'ouvrir le portail de facturation.",
        variant: "destructive",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {trigger && (
        <DialogTrigger asChild>
          {trigger}
        </DialogTrigger>
      )}
      
      <DialogContent 
        className="!w-[98vw] !max-w-[1200px] !max-h-[95vh] overflow-hidden p-0"
        style={{ width: '98vw', maxWidth: '1200px', maxHeight: '95vh' }}
      >
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-[#3899aa]" />
            Paramètres de l'application
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col md:flex-row h-[60vh]">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col md:flex-row w-full h-full">
            {/* Liste des onglets : horizontal sur mobile, vertical sur desktop */}
            <TabsList className="flex md:flex-col h-auto md:h-full w-full md:w-64 bg-muted/30 justify-start p-2 gap-1 md:space-y-1 flex-shrink-0 overflow-x-auto md:overflow-x-visible">
              <TabsTrigger
                value="account"
                className="w-auto md:w-full justify-center md:justify-start data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#4db3c5] data-[state=active]:to-[#1f5c6a] data-[state=active]:text-white"
              >
                <User className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Mon Compte</span>
              </TabsTrigger>
              <TabsTrigger
                value="security"
                className="w-auto md:w-full justify-center md:justify-start data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#4db3c5] data-[state=active]:to-[#1f5c6a] data-[state=active]:text-white"
              >
                <Shield className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Sécurité et confidentialité</span>
              </TabsTrigger>
              <TabsTrigger
                value="interface"
                className="w-auto md:w-full justify-center md:justify-start data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#4db3c5] data-[state=active]:to-[#1f5c6a] data-[state=active]:text-white"
              >
                <Palette className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Interface</span>
              </TabsTrigger>
              <TabsTrigger
                value="subscription"
                className="w-auto md:w-full justify-center md:justify-start data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#4db3c5] data-[state=active]:to-[#1f5c6a] data-[state=active]:text-white"
              >
                <CreditCard className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Mon Abonnement</span>
              </TabsTrigger>
              <TabsTrigger
                value="compliance"
                className="w-auto md:w-full justify-center md:justify-start data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#4db3c5] data-[state=active]:to-[#1f5c6a] data-[state=active]:text-white"
              >
                <FileText className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Conformité RGPD</span>
              </TabsTrigger>
            </TabsList>

            {/* Contenu des onglets */}
            <div className="flex-1 overflow-y-auto min-w-0">
              {/* Mon Compte */}
              <TabsContent value="account" className="m-0 p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-[#3899aa]">Informations personnelles</h3>
                  
                  <Card className="card-hover">
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="firstName">Prénom</Label>
                          <Input 
                            id="firstName" 
                            value={kineData.firstName}
                            disabled
                            className="bg-white dark:bg-zinc-900 text-foreground"
                          />
                          <p className="text-xs text-muted-foreground mt-1">Non modifiable</p>
                        </div>
                        <div>
                          <Label htmlFor="lastName">Nom</Label>
                          <Input 
                            id="lastName" 
                            value={kineData.lastName}
                            disabled
                            className="bg-white dark:bg-zinc-900 text-foreground"
                          />
                          <p className="text-xs text-muted-foreground mt-1">Non modifiable</p>
                        </div>
                      </div>
                      
                      <div>
                        <Label htmlFor="email">Email professionnel</Label>
                        <Input 
                          id="email" 
                          type="email" 
                          value={kineData.email}
                          disabled
                          className="bg-white dark:bg-zinc-900 text-foreground"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Non modifiable</p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="rpps">Numéro RPPS</Label>
                          <Input
                            id="rpps"
                            value={kineData.rpps}
                            onChange={(e) => setKineData({...kineData, rpps: e.target.value})}
                            className="bg-white dark:bg-zinc-900 text-foreground"
                          />
                        </div>
                        <div>
                          <Label htmlFor="phone">Téléphone</Label>
                          <Input
                            id="phone"
                            value={kineData.phone}
                            onChange={(e) => setKineData({...kineData, phone: e.target.value})}
                            className="bg-white dark:bg-zinc-900 text-foreground"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <Label htmlFor="address">Adresse du cabinet</Label>
                        <Input
                          id="address"
                          value={kineData.adresseCabinet}
                          onChange={(e) => setKineData({...kineData, adresseCabinet: e.target.value})}
                          className="bg-white dark:bg-zinc-900 text-foreground"
                        />
                      </div>
                      
                      <div className="flex items-center gap-4 mt-4">
                        <Button
                          onClick={handleSaveProfile}
                          disabled={loading}
                          className="btn-teal"
                        >
                          {loading ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Sauvegarde...
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-2" />
                              Sauvegarder les modifications
                            </>
                          )}
                        </Button>
                        
                        {/* Message de confirmation */}
                        {saveMessage && (
                          <div className={`flex items-center gap-2 text-sm font-medium transition-all duration-300 ${
                            saveMessage.includes('✅') 
                              ? 'text-green-600' 
                              : 'text-red-600'
                          }`}>
                            {saveMessage.includes('✅') && <CheckCircle className="h-4 w-4" />}
                            {saveMessage}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Sécurité et confidentialité */}
              <TabsContent value="security" className="m-0 p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-[#3899aa]">Sécurité et confidentialité</h3>
                  
                  <div className="space-y-4">
                    <Card className="card-hover">
                      <CardHeader>
                        <CardTitle className="text-base text-foreground">Mot de passe</CardTitle>
                        <CardDescription className="text-foreground">
                          Modifiez votre mot de passe de connexion via un email sécurisé
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                          <div className="flex items-start gap-3">
                            <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                                Sécurité renforcée
                              </p>
                              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                                Pour votre sécurité, la modification du mot de passe se fait via un email de réinitialisation sécurisé envoyé à votre adresse : <span className="font-medium">{kineData.email}</span>
                              </p>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <Button 
                            onClick={handlePasswordReset}
                            disabled={passwordResetLoading || !kineData.email}
                            variant="outline"
                          >
                            {passwordResetLoading ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Envoi en cours...
                              </>
                            ) : (
                              <>
                                <Shield className="h-4 w-4 mr-2" />
                                Envoyer l'email de réinitialisation
                              </>
                            )}
                          </Button>
                          
                          {/* Message de confirmation pour le reset */}
                          {passwordResetMessage && (
                            <div className={`flex items-center gap-2 text-sm font-medium transition-all duration-300 ${
                              passwordResetMessage.includes('✅') 
                                ? 'text-green-600' 
                                : 'text-red-600'
                            }`}>
                              {passwordResetMessage.includes('✅') && <CheckCircle className="h-4 w-4" />}
                              {passwordResetMessage}
                            </div>
                          )}
                        </div>
                        
                        <div className="text-xs text-muted-foreground">
                          <p>• L'email sera envoyé à votre adresse de connexion</p>
                          <p>• Le lien de réinitialisation expire dans 1 heure</p>
                          <p>• Vérifiez vos spams si vous ne recevez pas l'email</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              {/* Interface */}
              <TabsContent value="interface" className="m-0 p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-[#3899aa]">Préférences d'interface</h3>
                  
                  <div className="space-y-4">
                    <Card className="card-hover">
                      <CardHeader>
                        <CardTitle className="text-base text-foreground">Apparence</CardTitle>
                        <CardDescription className="text-foreground">
                          Personnalisez l'apparence de l'application
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div>
                          <Label>Thème</Label>
                          <Select 
                            defaultValue="system" 
                            onValueChange={handleThemeChange}
                          >
                            <SelectTrigger className="w-full mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="light">
                                <div className="flex items-center">
                                  <Sun className="h-4 w-4 mr-2" />
                                  Clair
                                </div>
                              </SelectItem>
                              <SelectItem value="dark">
                                <div className="flex items-center">
                                  <Moon className="h-4 w-4 mr-2" />
                                  Sombre
                                </div>
                              </SelectItem>
                              <SelectItem value="system">
                                <div className="flex items-center">
                                  <Monitor className="h-4 w-4 mr-2" />
                                  Système
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="card-hover">
                      <CardHeader>
                        <CardTitle className="text-base text-foreground">Notifications</CardTitle>
                        <CardDescription className="text-foreground">
                          Configurez vos préférences de notifications
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                          <div className="flex items-center gap-3">
                            <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                              La gestion des notifications sera disponible prochainement.
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>

              {/* Mon Abonnement */}
              <TabsContent value="subscription" className="m-0 p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-[#3899aa]">Mon Abonnement</h3>

                  {subscriptionLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                      <span className="ml-2">Chargement de votre abonnement...</span>
                    </div>
                  ) : (
                    <Card className="card-hover">
                      <CardContent className="pt-6 space-y-6">
                        <div className="flex items-center justify-between p-4 border rounded-lg">
                          <div>
                            <div className="flex items-center gap-3">
                              <h4 className="font-semibold text-lg">
                                {subscription ? getPlanByType(subscription.planType).name : 'Aucun abonnement'}
                              </h4>
                              <Badge
                                variant={subscription ? 'default' : 'secondary'}
                                className={
                                  subscription?.cancelAtPeriodEnd ? 'bg-orange-100 text-orange-800' :
                                  subscription ? 'bg-green-100 text-green-800' : ''
                                }
                              >
                                {subscription?.cancelAtPeriodEnd ? 'Résiliation programmée' :
                                 subscription ? 'Actif' : 'Gratuit'}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              {subscription ?
                                `${getPlanByType(subscription.planType).price}€/mois` :
                                'Plan gratuit limité'
                              }
                            </p>
                            {subscription && subscription.currentPeriodEnd && (
                              <p className="text-xs text-muted-foreground mt-2">
                                {subscription.cancelAtPeriodEnd
                                  ? `Accès jusqu'au ${new Date(subscription.currentPeriodEnd).toLocaleDateString('fr-FR')}`
                                  : `Prochain paiement : ${new Date(subscription.currentPeriodEnd).toLocaleDateString('fr-FR')}`
                                }
                              </p>
                            )}
                          </div>
                          <Button
                            size="sm"
                            className="btn-teal"
                            onClick={() => setIsPaywallModalOpen(true)}
                          >
                            Changer de plan
                          </Button>
                        </div>

                        <div className="p-4 bg-muted/30 rounded-lg border">
                          <p className="text-sm text-muted-foreground mb-3">
                            Consultez vos factures, modifiez votre moyen de paiement ou résiliez votre abonnement.
                          </p>
                          <Button
                            onClick={handleOpenPortal}
                            disabled={portalLoading}
                            className="btn-teal"
                          >
                            {portalLoading ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Ouverture...
                              </>
                            ) : (
                              <>
                                <CreditCard className="h-4 w-4 mr-2" />
                                Gérer mon abonnement
                              </>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>

              {/* Conformité RGPD */}
              <TabsContent value="compliance" className="m-0 p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-[#3899aa]">Conformité RGPD</h3>
                  
                  <div className="space-y-4">
                    <Card className="card-hover">
                      <CardHeader>
                        <CardTitle className="text-base text-foreground">Vos données</CardTitle>
                        <CardDescription className="text-foreground">
                          Gérez et contrôlez vos données personnelles
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">Télécharger mes données</p>
                            <p className="text-sm text-muted-foreground">
                              Exportez toutes vos données personnelles (ZIP, 24h de validité)
                            </p>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => setIsExportModalOpen(true)}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Télécharger
                          </Button>
                        </div>
                        
                        <div className="flex items-center justify-between p-3 border rounded-lg border-destructive/20">
                          <div>
                            <p className="font-medium text-destructive">Supprimer mon compte</p>
                            <p className="text-sm text-muted-foreground">
                              Suppression définitive après période de grâce de 7 jours
                            </p>
                          </div>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => setIsDeleteModalOpen(true)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Supprimer
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="card-hover">
                      <CardHeader>
                        <CardTitle className="text-base text-foreground">Conservation des données</CardTitle>
                        <CardDescription className="text-foreground">
                          Durée de conservation de vos données
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div>
                          <Label>Durée de conservation</Label>
                          <div className="flex items-center mt-1 p-3 border rounded-lg bg-muted/20">
                            <Database className="h-4 w-4 mr-2" />
                            <span>10 ans</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            Conforme aux obligations légales de conservation des données
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="card-hover">
                      <CardHeader>
                        <CardTitle className="text-base text-foreground">Consentements</CardTitle>
                        <CardDescription className="text-foreground">
                          Gérez vos consentements pour le traitement des données
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>

      {/* 🔒 NOUVEAU : Modales RGPD */}
      <RGPDExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        kineData={kineData}
      />
      
      <RGPDDeleteModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        kineData={kineData}
      />

      <PaywallModal
        isOpen={isPaywallModalOpen}
        onClose={() => setIsPaywallModalOpen(false)}
        subscription={subscription}
      />
    </Dialog>
  );
}

// Composant Notifications Dropdown (Header)
function NotificationsDropdown() {
  const [notifications, setNotifications] = useState<Array<{
    id: number;
    type: string;
    title: string;
    message: string;
    isRead: boolean;
    createdAt: string;
    metadata?: any;
  }>>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - time.getTime()) / (1000 * 60));
    if (diffInMinutes < 1) return 'À l\'instant';
    if (diffInMinutes < 60) return `${diffInMinutes}min`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
    return `${Math.floor(diffInMinutes / 1440)}j`;
  };

  const getNotifIcon = (type: string) => {
    switch (type) {
      case 'DAILY_VALIDATION': return <Calendar className="h-4 w-4 text-blue-500" />;
      case 'PROGRAM_COMPLETED': return <Trophy className="h-4 w-4 text-green-500" />;
      case 'PAIN_ALERT': return <AlertCircle className="h-4 w-4 text-red-500" />;
      case 'PATIENT_REQUEST': return <MessageCircle className="h-4 w-4 text-teal-500" />;
      default: return <Bell className="h-4 w-4 text-blue-500" />;
    }
  };

  const fetchUnreadCount = async () => {
    try {
      const user = getAuth(app).currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/unread-count`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) setUnreadCount(data.count);
      }
    } catch {}
  };

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const user = getAuth(app).currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications?limit=10`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success) setNotifications(data.notifications);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  const markAllAsRead = async () => {
    try {
      const user = getAuth(app).currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/mark-all-read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
        setUnreadCount(0);
      }
    } catch {}
  };

  const markAsRead = async (id: number) => {
    try {
      const user = getAuth(app).currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/notifications/${id}/read`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch {}
  };

  // Fetch unread count on mount + poll every 60s
  React.useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = auth.onAuthStateChanged((user: any) => {
      if (user) fetchUnreadCount();
    });
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  // Fetch notifications when popover opens
  React.useEffect(() => {
    if (isOpen) fetchNotifications();
  }, [isOpen]);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 rounded-full hover:bg-white/20 transition-colors" title="Notifications">
          <Bell className="h-5 w-5 text-white" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full h-4 min-w-[16px] flex items-center justify-center px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end" sideOffset={8}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-sm">Notifications</h3>
          {unreadCount > 0 && (
            <button onClick={markAllAsRead} className="text-xs text-[#3899aa] hover:underline">
              Tout marquer comme lu
            </button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="text-center py-8 px-4">
              <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Aucune notification</p>
            </div>
          ) : (
            notifications.map(notif => (
              <div
                key={notif.id}
                className={`flex items-start gap-3 p-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors cursor-pointer`}
                onClick={() => { if (!notif.isRead) markAsRead(notif.id); setIsOpen(false); router.push('/dashboard/kine/notifications'); }}
              >
                <div className="mt-0.5 flex-shrink-0">{getNotifIcon(notif.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm truncate ${!notif.isRead ? 'font-semibold' : ''}`}>
                      {notif.title}
                    </p>
                    {!notif.isRead && <span className="h-2 w-2 bg-[#3899aa] rounded-full flex-shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{notif.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{formatTimeAgo(notif.createdAt)}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="border-t p-2">
          <button
            onClick={() => { setIsOpen(false); router.push('/dashboard/kine/notifications'); }}
            className="w-full text-center text-sm text-[#3899aa] hover:bg-muted/50 py-2 rounded-md transition-colors font-medium"
          >
            Voir toutes les notifications
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function AppLayout({ children }: AppLayoutProps) {
  const currentPathname = usePathname();
  const router = useRouter();
  const role = getRoleFromPath(currentPathname);
  const [loading, setLoading] = React.useState(false);

  // ✨ Vérification email obligatoire
  React.useEffect(() => {
    const user = getAuth(app).currentUser;
    if (user && !user.emailVerified && (role === 'kine' || role === 'patient')) {
      router.replace('/verify-email-required');
    }
  }, [role, router]);

  // ✨ Listener pour détecter les changements d'état d'authentification
  React.useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        // Forcer le refresh du statut email
        user.reload();
      }
    });
    
    return () => unsubscribe();
  }, []);

  const getNavigationItems = () => {
    if (role === 'kine') {
      return [
        { href: '/dashboard/kine/home', label: 'Accueil Kiné', icon: Home, disabled: false },
        { href: '/dashboard/kine/patients', label: 'Patients', icon: Users, disabled: false },
        { href: '/dashboard/kine/create-exercise', label: 'Mes Exercices', icon: Dumbbell, disabled: false },
        { href: '/dashboard/kine/programmes', label: 'Programmes', icon: Calendar, disabled: false },
        { href: '/dashboard/kine/bilan-kine', label: 'Bilan Kiné', icon: ClipboardCheck, disabled: false },
        { href: '/dashboard/kine/chatbot', label: 'IA Conversationnelle', icon: Wand2, disabled: false },
        { href: '/dashboard/kine/chatbot-biblio', label: 'IA Bibliographique', icon: BookOpen, disabled: false },
        { href: '/dashboard/kine/chatbot-clinique', label: 'IA Clinique', icon: Stethoscope, disabled: false },
        { href: '/dashboard/kine/chatbot-admin', label: 'IA Administrative', icon: FileText, disabled: false },
        { href: '/dashboard/kine/parrainage', label: 'Parrainage', icon: Gift, disabled: false },
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

  // Subscription pour le bouton Upgrade dans le header
  const { subscription: headerSubscription } = useSubscription();
  const [isPaywallHeaderOpen, setIsPaywallHeaderOpen] = useState(false);

  // Profil kiné pour l'avatar header (cache localStorage pour éviter flash)
  const [headerInitials, setHeaderInitials] = useState('');
  const [headerName, setHeaderName] = useState('');
  const [headerEmail, setHeaderEmail] = useState('');
  const [headerAvatarUrl, setHeaderAvatarUrl] = useState('');
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [isPlanPopoverOpen, setIsPlanPopoverOpen] = useState(false);
  const planPopoverTimeout = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  // Lecture cache localStorage au montage (après hydratation)
  React.useEffect(() => {
    const cachedInitials = localStorage.getItem('kine_initials');
    const cachedName = localStorage.getItem('kine_name');
    const cachedEmail = localStorage.getItem('kine_email');
    const cachedAvatar = localStorage.getItem('kine_avatar_url');
    if (cachedInitials) setHeaderInitials(cachedInitials);
    if (cachedName) setHeaderName(cachedName);
    if (cachedEmail) setHeaderEmail(cachedEmail);
    if (cachedAvatar) setHeaderAvatarUrl(cachedAvatar);
  }, []);

  React.useEffect(() => {
    if (role !== 'kine') return;
    const fetchProfile = async () => {
      try {
        const auth = getAuth(app);
        const user = auth.currentUser;
        if (!user) return;
        const token = await user.getIdToken();
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/kine/profile`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (response.ok) {
          const data = await response.json();
          const first = data.firstName?.charAt(0)?.toUpperCase() || '';
          const last = data.lastName?.charAt(0)?.toUpperCase() || '';
          const initials = first + last;
          const name = `${data.firstName || ''} ${data.lastName || ''}`.trim();
          const email = data.email || '';
          const avatarUrl = data.avatarUrl || '';
          setHeaderInitials(initials);
          setHeaderName(name);
          setHeaderEmail(email);
          setHeaderAvatarUrl(avatarUrl);
          localStorage.setItem('kine_initials', initials);
          localStorage.setItem('kine_name', name);
          localStorage.setItem('kine_email', email);
          if (avatarUrl) {
            localStorage.setItem('kine_avatar_url', avatarUrl);
          } else {
            localStorage.removeItem('kine_avatar_url');
          }
        }
      } catch (error) {
        // Silencieux
      }
    };
    fetchProfile();
  }, [role]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input pour permettre de re-sélectionner le même fichier
    e.target.value = '';

    if (file.size > 2 * 1024 * 1024) {
      alert('L\'image ne doit pas dépasser 2 Mo.');
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('Format non supporté. Utilisez JPEG, PNG ou WebP.');
      return;
    }

    setIsAvatarUploading(true);
    try {
      const auth = getAuth(app);
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();

      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/kine/profile/avatar`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.avatarUrl) {
          setHeaderAvatarUrl(data.avatarUrl);
          localStorage.setItem('kine_avatar_url', data.avatarUrl);
        }
      } else {
        const err = await response.json().catch(() => null);
        alert(err?.error || 'Erreur lors de l\'upload de l\'avatar.');
      }
    } catch {
      alert('Erreur réseau lors de l\'upload.');
    } finally {
      setIsAvatarUploading(false);
    }
  };

  const handleLogout = async () => {
    try {
      localStorage.removeItem('kine_initials');
      localStorage.removeItem('kine_name');
      localStorage.removeItem('kine_email');
      localStorage.removeItem('kine_avatar_url');
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
      {/* Fond uni */}
      <div className="fixed inset-0 z-0 bg-white dark:bg-[#141414]" />
      <Sidebar collapsible="icon" side="left" variant="sidebar" className="text-sm text-foreground border-r border-primary/20 bg-[#eef7f6] dark:bg-[#0f1c1b]">
        <SidebarHeader className="h-14 flex-row items-center gap-3 px-3 border-b border-primary/20 bg-[#4db3c5]">
          <img
            src="/logo.jpg"
            alt="Mon Assistant Kiné"
            className="h-9 w-9 rounded-md object-contain flex-shrink-0 bg-white/15 p-0.5"
          />
          <span className="font-semibold text-white text-base truncate group-data-[state=collapsed]:hidden">Mon Assistant Kiné</span>
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
                    (item.href !== '/' && !item.href.endsWith('/home') && currentPathname.startsWith(item.href + '/')) ||
                    (item.href.endsWith('/home') && currentPathname === item.href)
                  }
                  disabled={item.disabled && item.label.includes('(Bientôt)')}
                  aria-disabled={item.disabled && !item.label.includes('(Bientôt)')}
                  className={item.disabled && !item.label.includes('(Bientôt)') ? "text-foreground/40 cursor-not-allowed opacity-60" : "text-foreground hover:border hover:border-[#3899aa]/50 hover:shadow-[0_0_12px_rgba(56,153,170,0.3)] hover:bg-transparent data-[active=true]:border data-[active=true]:border-[#3899aa]/50 data-[active=true]:shadow-[0_0_12px_rgba(56,153,170,0.3)] data-[active=true]:bg-transparent"}
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
      </Sidebar>

      <SidebarInset className="min-w-0">
        {/* Header principal - toutes tailles */}
        <header className="sticky top-0 z-50 bg-gradient-to-r from-[#4db3c5] to-[#1f5c6a] shadow-md">
          <div className="flex h-14 items-center px-4 gap-3">
            <SidebarTrigger className="text-white hover:bg-white/20" />
            <span className="hidden sm:flex items-center text-white/90 text-sm font-medium ml-2 capitalize">
              {format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
            </span>
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              {role === 'kine' && headerSubscription && headerSubscription.planType === 'FREE' && (
                <button
                  onClick={() => setIsPaywallHeaderOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-400 hover:bg-sky-300 text-white text-xs font-bold shadow-md transition-all duration-200 hover:scale-105 hover:shadow-lg"
                >
                  <Crown className="h-3.5 w-3.5" />
                  Passer à Premium
                </button>
              )}
              {role === 'kine' && headerSubscription && headerSubscription.planType && headerSubscription.planType !== 'FREE' && (() => {
                const currentPlan = getPlanByType(headerSubscription.planType);
                const canUpgrade = ['DECLIC', 'PRATIQUE'].includes(headerSubscription.planType);
                return (
                  <Popover open={isPlanPopoverOpen} onOpenChange={setIsPlanPopoverOpen}>
                    <PopoverTrigger asChild>
                      <button
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-400 text-white text-xs font-bold shadow-md cursor-default"
                        onMouseEnter={() => {
                          if (planPopoverTimeout.current) clearTimeout(planPopoverTimeout.current);
                          setIsPlanPopoverOpen(true);
                        }}
                        onMouseLeave={() => {
                          planPopoverTimeout.current = setTimeout(() => setIsPlanPopoverOpen(false), 150);
                        }}
                      >
                        {headerSubscription.planType}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-72 p-0"
                      align="end"
                      sideOffset={8}
                      onMouseEnter={() => {
                        if (planPopoverTimeout.current) clearTimeout(planPopoverTimeout.current);
                      }}
                      onMouseLeave={() => {
                        planPopoverTimeout.current = setTimeout(() => setIsPlanPopoverOpen(false), 150);
                      }}
                    >
                      <div className="p-4 border-b bg-gradient-to-r from-[#eef7f6] to-white dark:from-[#0f1c1b] dark:to-[#141414]">
                        <div className="flex items-center gap-2 mb-1">
                          <Crown className="h-4 w-4 text-[#3899aa]" />
                          <p className="text-sm font-bold text-foreground">Plan {currentPlan.name}</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{currentPlan.price}€/mois</p>
                      </div>
                      <div className="p-3">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Inclus dans votre plan</p>
                        <ul className="space-y-1.5">
                          <li className="flex items-center gap-2 text-xs text-foreground">
                            <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            {currentPlan.features.maxProgrammes === Infinity ? 'Programmes illimités' : `${currentPlan.features.maxProgrammes} programme${currentPlan.features.maxProgrammes > 1 ? 's' : ''} patient`}
                          </li>
                          {currentPlan.features.assistants.includes('CONVERSATIONNEL') && (
                            <li className="flex items-center gap-2 text-xs text-foreground">
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              Assistant conversationnel
                            </li>
                          )}
                          {currentPlan.features.assistants.includes('BIBLIOTHEQUE') && (
                            <li className="flex items-center gap-2 text-xs text-foreground">
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              Assistant bibliographique
                            </li>
                          )}
                          {currentPlan.features.assistants.includes('CLINIQUE') && (
                            <li className="flex items-center gap-2 text-xs text-foreground">
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              Assistant clinique
                            </li>
                          )}
                          {currentPlan.features.assistants.includes('ADMINISTRATIF') && (
                            <li className="flex items-center gap-2 text-xs text-foreground">
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              Assistant administratif
                            </li>
                          )}
                          {currentPlan.features.bilanKine && (
                            <li className="flex items-center gap-2 text-xs text-foreground">
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                              Bilan kiné
                            </li>
                          )}
                        </ul>
                      </div>
                      {canUpgrade && (
                        <div className="border-t p-3">
                          <button
                            onClick={() => setIsPaywallHeaderOpen(true)}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#3899aa] hover:bg-[#2d7a88] text-white text-xs font-bold transition-colors"
                          >
                            <Crown className="h-3.5 w-3.5" />
                            Passer au plan supérieur
                          </button>
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                );
              })()}
              {role === 'kine' && <NotificationsDropdown />}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="rounded-full hover:ring-2 hover:ring-white/40 transition-all">
                    <Avatar className="h-8 w-8 border-2 border-white/30 cursor-pointer">
                      {headerAvatarUrl && <AvatarImage src={headerAvatarUrl} alt="Avatar" />}
                      <AvatarFallback className="bg-white/20 text-white text-xs font-semibold">
                        {headerInitials || displayInitials}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0" align="end" sideOffset={8}>
                  {/* Profil */}
                  <div className="flex flex-col items-center gap-2 p-4 border-b">
                    <button
                      type="button"
                      className="relative group cursor-pointer"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={isAvatarUploading}
                    >
                      <Avatar className="h-16 w-16 border-2 border-[#3899aa]/30">
                        {headerAvatarUrl && <AvatarImage src={headerAvatarUrl} alt="Avatar" />}
                        <AvatarFallback className="bg-[#eef7f6] text-[#1f5c6a] text-lg font-semibold">
                          {headerInitials || displayInitials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                        {isAvatarUploading ? (
                          <Loader2 className="h-5 w-5 text-white animate-spin" />
                        ) : (
                          <Camera className="h-5 w-5 text-white" />
                        )}
                      </div>
                    </button>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleAvatarUpload}
                    />
                    <div className="text-center min-w-0 w-full">
                      <p className="text-sm font-semibold text-foreground truncate">{headerName || 'Mon compte'}</p>
                      <p className="text-xs text-muted-foreground truncate">{headerEmail}</p>
                    </div>
                  </div>
                  {/* Actions */}
                  <div className="p-1">
                    <button
                      onClick={() => setIsSettingsOpen(true)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-foreground hover:bg-muted/50 rounded-md transition-colors"
                    >
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      Paramètres
                    </button>
                  </div>
                  {/* Déconnexion */}
                  <div className="border-t p-1">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-md transition-colors"
                    >
                      <LogOut className="h-4 w-4" />
                      Déconnexion
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
              <SettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
            </div>
          </div>
        </header>

        {/* Contenu principal */}
        <div className="relative p-4 md:p-6 lg:p-8 text-foreground overflow-x-hidden">
          <div
            className="pointer-events-none absolute top-0 right-0 w-[600px] h-[600px] opacity-[0.07] dark:opacity-[0.12] rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, #3899aa, transparent 70%)' }}
          />
          <div className="relative z-10">
            {children}
          </div>
        </div>

        {/* Footer mentions légales */}
        <footer className="py-2 px-4 text-center opacity-40 hover:opacity-100 transition-opacity duration-300">
          <div className="text-[10px] text-muted-foreground">
            <span>© {new Date().getFullYear()} Mon Assistant Kiné</span>
            <span className="mx-1.5">•</span>
            <a href="/legal/cgu.html" target="_blank" rel="noopener noreferrer" className="hover:underline">CGU</a>
            <span className="mx-1">•</span>
            <a href="/legal/politique-confidentialite.html" target="_blank" rel="noopener noreferrer" className="hover:underline">Confidentialité</a>
            <span className="mx-1">•</span>
            <a href="/legal/mentions-legales.html" target="_blank" rel="noopener noreferrer" className="hover:underline">Mentions légales</a>
          </div>
        </footer>
      </SidebarInset>

      {/* PaywallModal pour le bouton Upgrade du header */}
      <PaywallModal
        isOpen={isPaywallHeaderOpen}
        onClose={() => setIsPaywallHeaderOpen(false)}
        subscription={headerSubscription}
      />
    </SidebarProvider>
  );
}