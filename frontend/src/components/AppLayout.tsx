'use client';

import React, { useState } from 'react';
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  User,
  Shield,
  Palette,
  Save,
  Eye,
  EyeOff,
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
  AlertTriangle
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { RoleOrUnknown } from '@/types/user';
import { getAuth, signOut } from 'firebase/auth';
import { app } from '@/lib/firebase/config';
import { PlanIndicator } from './PlanIndicator';
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
function SettingsModal() {
  const [isOpen, setIsOpen] = useState(false);
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
  
  // 💳 NOUVEAU : État pour la modal Paywall
  const [isPaywallModalOpen, setIsPaywallModalOpen] = useState(false);
  
  // 🚫 NOUVEAU : État pour la modal de résiliation
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const { toast } = useToast();
  const { subscription, usage, isLoading: subscriptionLoading, refreshSubscription } = useSubscription();

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
          adresseCabinet: kineData.adresseCabinet
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

  // Fonction pour résilier l'abonnement
  const handleCancelSubscription = async () => {
    setCancelLoading(true);
    
    try {
      const auth = getAuth(app);
      const user = auth.currentUser;
      
      if (!user) {
        toast({
          title: "Erreur",
          description: "Vous devez être connecté",
          variant: "destructive"
        });
        return;
      }

      const token = await user.getIdToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/stripe/cancel-subscription`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          cancelAtPeriodEnd: true // Pas de résiliation immédiate
        })
      });

      const data = await response.json();

      if (response.ok) {
        const endDate = subscription?.currentPeriodEnd 
          ? new Date(subscription.currentPeriodEnd).toLocaleDateString('fr-FR')
          : 'la fin de la période en cours';
          
        toast({
          title: "Résiliation programmée",
          description: `Votre abonnement sera résilié le ${endDate}. Vous gardez l'accès jusqu'à cette date.`,
          className: "bg-orange-50 border-orange-200 text-orange-800",
          duration: 8000
        });
        
        // Fermer la modal et rafraîchir les données
        setIsCancelModalOpen(false);
        await refreshSubscription();
        
      } else {
        throw new Error(data.details || data.error || 'Erreur lors de la résiliation');
      }

    } catch (error) {
      console.error('Erreur résiliation:', error);
      toast({
        title: "Erreur de résiliation",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setCancelLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <SidebarMenuButton tooltip="Paramètres" className="text-foreground hover:border hover:border-[#3899aa]/50 hover:shadow-[0_0_12px_rgba(56,153,170,0.3)] hover:bg-transparent">
          <Settings className="h-4 w-4 shrink-0" />
          <span>Paramètres</span>
        </SidebarMenuButton>
      </DialogTrigger>
      
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

        <div className="flex min-h-[500px] max-h-[85vh]">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex w-full">
            {/* Liste des onglets à gauche */}
            <TabsList className="flex-col h-full w-64 bg-muted/30 justify-start p-2 space-y-1 flex-shrink-0">
              <TabsTrigger
                value="account"
                className="w-full justify-start data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#4db3c5] data-[state=active]:to-[#1f5c6a] data-[state=active]:text-white"
              >
                <User className="h-4 w-4 mr-2" />
                Mon Compte
              </TabsTrigger>
              <TabsTrigger
                value="security"
                className="w-full justify-start data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#4db3c5] data-[state=active]:to-[#1f5c6a] data-[state=active]:text-white"
              >
                <Shield className="h-4 w-4 mr-2" />
                Sécurité et confidentialité
              </TabsTrigger>
              <TabsTrigger
                value="interface"
                className="w-full justify-start data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#4db3c5] data-[state=active]:to-[#1f5c6a] data-[state=active]:text-white"
              >
                <Palette className="h-4 w-4 mr-2" />
                Interface
              </TabsTrigger>
              <TabsTrigger
                value="subscription"
                className="w-full justify-start data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#4db3c5] data-[state=active]:to-[#1f5c6a] data-[state=active]:text-white"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Mon Abonnement
              </TabsTrigger>
              <TabsTrigger
                value="compliance"
                className="w-full justify-start data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#4db3c5] data-[state=active]:to-[#1f5c6a] data-[state=active]:text-white"
              >
                <FileText className="h-4 w-4 mr-2" />
                Conformité RGPD
              </TabsTrigger>
            </TabsList>

            {/* Contenu des onglets */}
            <div className="flex-1 overflow-y-auto min-w-0">
              {/* Mon Compte */}
              <TabsContent value="account" className="m-0 p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4 text-[#3899aa]">Informations personnelles</h3>
                  
                  <Card className="card-hover">
                    <CardHeader>
                      <CardTitle className="text-base text-foreground">Profil professionnel</CardTitle>
                      <CardDescription className="text-foreground">
                        Gérez vos informations de kinésithérapeute
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="firstName">Prénom</Label>
                          <Input 
                            id="firstName" 
                            value={kineData.firstName}
                            disabled
                            className="bg-muted text-muted-foreground"
                          />
                          <p className="text-xs text-muted-foreground mt-1">Non modifiable</p>
                        </div>
                        <div>
                          <Label htmlFor="lastName">Nom</Label>
                          <Input 
                            id="lastName" 
                            value={kineData.lastName}
                            disabled
                            className="bg-muted text-muted-foreground"
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
                          className="bg-muted text-muted-foreground"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Non modifiable</p>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="rpps">Numéro RPPS</Label>
                          <Input 
                            id="rpps" 
                            value={kineData.rpps}
                            disabled
                            className="bg-muted text-muted-foreground"
                          />
                          <p className="text-xs text-muted-foreground mt-1">Non modifiable</p>
                        </div>
                        <div>
                          <Label htmlFor="phone">Téléphone</Label>
                          <Input 
                            id="phone" 
                            value={kineData.phone}
                            onChange={(e) => setKineData({...kineData, phone: e.target.value})}
                          />
                        </div>
                      </div>
                      
                      <div>
                        <Label htmlFor="address">Adresse du cabinet</Label>
                        <Input 
                          id="address" 
                          value={kineData.adresseCabinet}
                          onChange={(e) => setKineData({...kineData, adresseCabinet: e.target.value})}
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
                    <div className="space-y-4">
                      {/* Informations essentielles */}
                      <Card className="card-hover">
                        <CardHeader>
                          <CardTitle className="text-base text-foreground">Plan actuel</CardTitle>
                          <CardDescription className="text-foreground">
                            Informations sur votre abonnement en cours
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="flex items-center justify-between p-4 border rounded-lg">
                            <div>
                              <div className="flex items-center gap-3">
                                <h4 className="font-semibold text-lg">
                                  {subscription ? getPlanByType(subscription.planType).name : 'Aucun abonnement'}
                                </h4>
                                <Badge 
                                  variant={subscription ? 'default' : 'secondary'}
                                  className={subscription ? 'bg-green-100 text-green-800' : ''}
                                >
                                  {subscription ? 'Actif' : 'Gratuit'}
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
                                  Prochain paiement : {new Date(subscription.currentPeriodEnd).toLocaleDateString('fr-FR')}
                                </p>
                              )}
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-medium">
                                Statut : <span className={subscription ? 'text-green-600' : 'text-orange-600'}>
                                  {subscription ? 'Payé' : 'Gratuit'}
                                </span>
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Gestion des paiements */}
                      <Card className="card-hover">
                        <CardHeader>
                          <CardTitle className="text-base text-foreground">Gestion des paiements</CardTitle>
                          <CardDescription className="text-foreground">
                            Gérez vos factures et moyens de paiement
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <p className="font-medium">Historique des factures</p>
                              <p className="text-sm text-muted-foreground">
                                Téléchargez vos factures et relevés
                              </p>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                // TODO: Implémenter téléchargement factures
                                toast({
                                  title: "Bientôt disponible",
                                  description: "Le téléchargement des factures sera disponible prochainement."
                                });
                              }}
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Télécharger
                            </Button>
                          </div>
                          
                          <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <p className="font-medium">Gérer la facturation</p>
                              <p className="text-sm text-muted-foreground">
                                Modifier vos informations de paiement via Stripe
                              </p>
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => {
                                // TODO: Ouvrir portail Stripe
                                toast({
                                  title: "Bientôt disponible", 
                                  description: "Le portail de facturation sera disponible prochainement."
                                });
                              }}
                            >
                              <CreditCard className="h-4 w-4 mr-2" />
                              Gérer
                            </Button>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Actions d'abonnement */}
                      <Card className="card-hover">
                        <CardHeader>
                          <CardTitle className="text-base text-foreground">Actions d'abonnement</CardTitle>
                          <CardDescription className="text-foreground">
                            Modifier ou résilier votre abonnement
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="flex items-center justify-between p-3 border rounded-lg border-blue-200 bg-blue-50 dark:bg-blue-950/20">
                            <div>
                              <p className="font-medium text-blue-900 dark:text-blue-100">Passer au plan supérieur</p>
                              <p className="text-sm text-blue-700 dark:text-blue-300">
                                Débloquez plus de fonctionnalités et augmentez vos limites
                              </p>
                            </div>
                            <Button
                              size="sm"
                              className="btn-teal"
                              onClick={() => setIsPaywallModalOpen(true)}
                            >
                              Upgrader
                            </Button>
                          </div>
                          
                          {subscription && (
                            <div className="flex items-center justify-between p-3 border rounded-lg border-red-200">
                              <div>
                                <p className="font-medium text-red-900">Résilier mon abonnement</p>
                                <p className="text-sm text-muted-foreground">
                                  Votre accès restera actif jusqu'à la fin de la période
                                </p>
                              </div>
                              <Button 
                                variant="destructive" 
                                size="sm"
                                onClick={() => setIsCancelModalOpen(true)}
                              >
                                Résilier
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
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
      
      {/* 💳 NOUVEAU : Modal Paywall pour upgrade */}
      <PaywallModal
        isOpen={isPaywallModalOpen}
        onClose={() => setIsPaywallModalOpen(false)}
        subscription={subscription}
      />
      
      {/* 🚫 NOUVEAU : Modal de confirmation de résiliation */}
      <Dialog open={isCancelModalOpen} onOpenChange={setIsCancelModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-destructive">
              Résilier votre abonnement ?
            </DialogTitle>
            <DialogDescription className="text-center">
              Cette action programmera la résiliation de votre abonnement
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Informations sur l'abonnement actuel */}
            {subscription && (
              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-5 w-5 text-red-600" />
                  <span className="font-medium text-red-900">
                    Plan {getPlanByType(subscription.planType).name}
                  </span>
                </div>
                <div className="text-sm text-red-700 space-y-1">
                  <p>• Résiliation programmée pour le {subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString('fr-FR') : 'fin de période'}</p>
                  <p>• Accès maintenu jusqu'à cette date</p>
                  <p>• Aucun remboursement (facturation au prorata)</p>
                  <p>• Vous pourrez réactiver à tout moment avant l'expiration</p>
                </div>
              </div>
            )}

            {/* Avertissement */}
            <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-orange-800">
                  <p className="font-medium">Êtes-vous sûr de vouloir résilier ?</p>
                  <p className="mt-1">Cette action peut être annulée avant la date d'expiration en contactant le support.</p>
                </div>
              </div>
            </div>

            {/* Boutons */}
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsCancelModalOpen(false)}
                className="flex-1"
                disabled={cancelLoading}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={handleCancelSubscription}
                disabled={cancelLoading}
                className="flex-1"
              >
                {cancelLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Résiliation...
                  </>
                ) : (
                  'Confirmer la résiliation'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
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
        { href: '/dashboard/kine/notifications', label: 'Notifications', icon: Bell, disabled: false },
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
      {/* Fond uni */}
      <div className="fixed inset-0 z-0 bg-white dark:bg-[#141414]" />
      <Sidebar collapsible="icon" side="left" variant="sidebar" className="text-sm text-foreground border-r border-primary/20 bg-[#eef7f6] dark:bg-[#0f1c1b]">
        <SidebarHeader className="items-center gap-2 border-b border-primary/20 bg-gradient-to-b from-[#4db3c5] via-[#4db3c5] to-[#eef7f6] dark:to-[#0f1c1b] rounded-t-lg pb-6">
          <img
            src="/logo.jpg"
            alt="Mon Assistant Kiné"
            className="h-12 w-12 rounded-md object-contain group-data-[state=collapsed]:h-8 group-data-[state=collapsed]:w-8"
          />
          <SidebarTrigger className="ml-auto text-white hover:bg-white/20" />
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
        <SidebarFooter className="border-t border-primary/20 p-2">
          <SidebarMenu>
            {role === 'kine' && (
              <SidebarMenuItem>
                <div className="px-2 py-1 group-data-[state=collapsed]:hidden">
                  <PlanIndicator />
                </div>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SettingsModal />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Déconnexion" onClick={handleLogout} className="text-red-600 font-semibold hover:border hover:border-red-400 hover:shadow-[0_0_12px_rgba(239,68,68,0.3)] hover:bg-transparent hover:text-red-700">
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
            <div className="flex items-center gap-2 flex-1">
              <img 
                src="/logo.jpg" 
                alt="Mon Assistant Kiné" 
                className="h-6 w-6 rounded-md object-contain" 
              />
              <span className="font-semibold text-primary">Mon Assistant Kiné</span>
            </div>
            {/* Plan Indicator mobile - seulement pour les kinés en FREE */}
            {role === 'kine' && <PlanIndicator />}
          </div>
        </div>

        {/* Contenu principal */}
        <div className="relative p-4 md:p-6 lg:p-8 text-foreground min-h-screen">
{/* Accent subtil en haut à droite */}
          <div
            className="pointer-events-none absolute top-0 right-0 w-[600px] h-[600px] opacity-[0.07] dark:opacity-[0.12] rounded-full blur-3xl"
            style={{ background: 'radial-gradient(circle, #3899aa, transparent 70%)' }}
          />
          <div className="relative z-10">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}