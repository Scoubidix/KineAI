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
  Stethoscope
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { RoleOrUnknown } from '@/types/user';
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

  const { toast } = useToast();

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

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <SidebarMenuButton tooltip="Paramètres" className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
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
            <Settings className="h-5 w-5 text-primary" />
            Paramètres de l'application
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-[500px] max-h-[85vh]">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex w-full">
            {/* Liste des onglets à gauche */}
            <TabsList className="flex-col h-full w-64 bg-muted/30 justify-start p-2 space-y-1 flex-shrink-0">
              <TabsTrigger
                value="account"
                className="w-full justify-start data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <User className="h-4 w-4 mr-2" />
                Mon Compte
              </TabsTrigger>
              <TabsTrigger
                value="security"
                className="w-full justify-start data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Shield className="h-4 w-4 mr-2" />
                Sécurité et confidentialité
              </TabsTrigger>
              <TabsTrigger
                value="interface"
                className="w-full justify-start data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                <Palette className="h-4 w-4 mr-2" />
                Interface
              </TabsTrigger>
              <TabsTrigger
                value="compliance"
                className="w-full justify-start data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
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
                  <h3 className="text-lg font-semibold mb-4">Informations personnelles</h3>
                  
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Profil professionnel</CardTitle>
                      <CardDescription>
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
                  <h3 className="text-lg font-semibold mb-4">Sécurité et confidentialité</h3>
                  
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Mot de passe</CardTitle>
                        <CardDescription>
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
                  <h3 className="text-lg font-semibold mb-4">Préférences d'interface</h3>
                  
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Apparence</CardTitle>
                        <CardDescription>
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

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Notifications</CardTitle>
                        <CardDescription>
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

              {/* Conformité RGPD */}
              <TabsContent value="compliance" className="m-0 p-6 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Conformité RGPD</h3>
                  
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Vos données</CardTitle>
                        <CardDescription>
                          Gérez et contrôlez vos données personnelles
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">Télécharger mes données</p>
                            <p className="text-sm text-muted-foreground">
                              Exportez toutes vos données personnelles
                            </p>
                          </div>
                          <Button variant="outline" size="sm">
                            <Download className="h-4 w-4 mr-2" />
                            Télécharger
                          </Button>
                        </div>
                        
                        <div className="flex items-center justify-between p-3 border rounded-lg border-destructive/20">
                          <div>
                            <p className="font-medium text-destructive">Supprimer mon compte</p>
                            <p className="text-sm text-muted-foreground">
                              Suppression définitive de toutes vos données
                            </p>
                          </div>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Supprimer
                          </Button>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Conservation des données</CardTitle>
                        <CardDescription>
                          Durée de conservation de vos données médicales
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div>
                          <Label>Durée de conservation</Label>
                          <Select value={dataRetention} onValueChange={setDataRetention}>
                            <SelectTrigger className="w-full mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1-year">
                                <div className="flex items-center">
                                  <Database className="h-4 w-4 mr-2" />
                                  1 an
                                </div>
                              </SelectItem>
                              <SelectItem value="5-years">
                                <div className="flex items-center">
                                  <Database className="h-4 w-4 mr-2" />
                                  5 ans (recommandé)
                                </div>
                              </SelectItem>
                              <SelectItem value="10-years">
                                <div className="flex items-center">
                                  <Database className="h-4 w-4 mr-2" />
                                  10 ans
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-xs text-muted-foreground mt-1">
                            Conforme aux obligations légales de conservation des données de santé
                          </p>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Consentements</CardTitle>
                        <CardDescription>
                          Gérez vos consentements pour le traitement des données
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Données de santé</p>
                            <p className="text-sm text-muted-foreground">
                              Traitement des données médicales des patients
                            </p>
                          </div>
                          <Badge variant="secondary">Accepté ✓</Badge>
                        </div>
                        
                        <Separator />
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Analytics</p>
                            <p className="text-sm text-muted-foreground">
                              Amélioration de l'application via des statistiques anonymes
                            </p>
                          </div>
                          <Switch defaultChecked />
                        </div>
                        
                        <Separator />
                        
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">Communications marketing</p>
                            <p className="text-sm text-muted-foreground">
                              Recevoir des informations sur les nouvelles fonctionnalités
                            </p>
                          </div>
                          <Switch />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </DialogContent>
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
        { href: '/dashboard/kine/chatbot', label: 'IA Basique', icon: Wand2, disabled: false },
        { href: '/dashboard/kine/chatbot-biblio', label: 'IA Bibliographique', icon: BookOpen, disabled: false },
        { href: '/dashboard/kine/chatbot-clinique', label: 'IA Clinique', icon: Stethoscope, disabled: false },
        { href: '/dashboard/kine/chatbot-admin', label: 'IA Administrative', icon: FileText, disabled: false },
        { href: '/dashboard/kine/analytics', label: 'Statistiques', icon: BarChart2, disabled: false },
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
              <SettingsModal />
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
          </div>
        </div>

        {/* Contenu principal */}
        <div className="relative p-4 md:p-6 lg:p-8 bg-background text-foreground min-h-screen">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}