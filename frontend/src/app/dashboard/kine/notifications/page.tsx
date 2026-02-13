'use client';

import React, { useState, useEffect } from 'react';
import AppLayout from '@/components/AppLayout';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Bell,
  AlertCircle,
  Calendar,
  Trophy,
  CheckCircle,
  Loader2,
  RefreshCw,
  Filter,
  Eye,
  EyeOff,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { getAuth, onAuthStateChanged } from 'firebase/auth';

// Types pour les notifications
interface NotificationData {
  id: number;
  type: 'DAILY_VALIDATION' | 'PROGRAM_COMPLETED' | 'PAIN_ALERT';
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  patient: {
    id: number;
    name: string;
  } | null;
  programme: {
    id: number;
    titre: string;
  } | null;
  metadata: any;
}

interface NotificationStats {
  total: number;
  unread: number;
  today: number;
  byType: {
    DAILY_VALIDATION?: number;
    PROGRAM_COMPLETED?: number;
    PAIN_ALERT?: number;
  };
}

export default function KineNotificationsPage() {
  const { toast } = useToast();
  
  // États de données
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [stats, setStats] = useState<NotificationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // États de filtres
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);
  const [selectedType, setSelectedType] = useState<string>('all');

  const API_URL = process.env.NEXT_PUBLIC_API_URL;

  // Récupérer le token Firebase (même approche que le dashboard)
  const getAuthToken = async () => {
    const user = getAuth().currentUser;
    if (!user) {
      throw new Error('Utilisateur non connecté');
    }
    return await user.getIdToken();
  };

  // Charger les notifications
  const loadNotifications = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      if (!showLoader) setRefreshing(true);

      const token = await getAuthToken();
      
      // Construire l'URL avec les filtres
      const params = new URLSearchParams({
        limit: '50'
      });
      
      if (showOnlyUnread) {
        params.append('isRead', 'false');
      }
      
      if (selectedType !== 'all') {
        params.append('type', selectedType);
      }

      const response = await fetch(`${API_URL}/api/notifications?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Session expirée. Veuillez vous reconnecter.');
        }
        throw new Error('Erreur lors du chargement des notifications');
      }

      const data = await response.json();
      
      if (data.success) {
        setNotifications(data.notifications);
      } else {
        throw new Error(data.error || 'Erreur inconnue');
      }

    } catch (error) {
      console.error('Erreur chargement notifications:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de charger les notifications"
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Charger les statistiques
  const loadStats = async () => {
    try {
      const token = await getAuthToken();
      
      const response = await fetch(`${API_URL}/api/notifications/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setStats(data.stats);
        }
      }
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    }
  };

  // Marquer une notification comme lue
  const markAsRead = async (notificationId: number) => {
    try {
      const token = await getAuthToken();
      
      const response = await fetch(`${API_URL}/api/notifications/${notificationId}/read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Erreur lors du marquage');
      }

      const data = await response.json();
      
      if (data.success) {
        // Mettre à jour localement
        setNotifications(prev => 
          prev.map(notif => 
            notif.id === notificationId 
              ? { ...notif, isRead: true }
              : notif
          )
        );
        
        // Recharger les stats
        loadStats();
        
        toast({
          title: "Notification marquée comme lue",
          description: "La notification a été marquée comme lue."
        });
      }

    } catch (error) {
      console.error('Erreur marquage lecture:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de marquer comme lu"
      });
    }
  };

  // Marquer toutes comme lues
  const markAllAsRead = async () => {
    try {
      setMarkingAllRead(true);
      const token = await getAuthToken();
      
      const response = await fetch(`${API_URL}/api/notifications/mark-all-read`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Erreur lors du marquage');
      }

      const data = await response.json();
      
      if (data.success) {
        // Mettre à jour localement
        setNotifications(prev => 
          prev.map(notif => ({ ...notif, isRead: true }))
        );
        
        // Recharger les stats
        loadStats();
        
        toast({
          title: "Notifications marquées",
          description: `${data.count} notifications marquées comme lues`
        });
      }

    } catch (error) {
      console.error('Erreur marquage toutes:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de marquer toutes comme lues"
      });
    } finally {
      setMarkingAllRead(false);
    }
  };

  // Supprimer toutes les notifications
  const deleteAllNotifications = async () => {
    try {
      setDeleting(true);
      const token = await getAuthToken();

      const response = await fetch(`${API_URL}/api/notifications`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la suppression');
      }

      const data = await response.json();

      if (data.success) {
        setNotifications([]);
        setDeleteDialogOpen(false);
        loadStats();

        toast({
          title: "Notifications supprimées",
          description: `${data.deletedCount} notifications supprimées avec succès`
        });
      }

    } catch (error) {
      console.error('Erreur suppression notifications:', error);
      toast({
        variant: "destructive",
        title: "Erreur",
        description: "Impossible de supprimer les notifications"
      });
    } finally {
      setDeleting(false);
    }
  };

  // Helpers pour l'affichage
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'DAILY_VALIDATION':
        return <Calendar className="inline h-4 w-4 mr-1 text-blue-500" />;
      case 'PROGRAM_COMPLETED':
        return <Trophy className="inline h-4 w-4 mr-1 text-green-500" />;
      case 'PAIN_ALERT':
        return <AlertCircle className="inline h-4 w-4 mr-1 text-destructive" />;
      default:
        return <Bell className="inline h-4 w-4 mr-1 text-blue-500" />;
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInMinutes = Math.floor((now.getTime() - time.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'À l\'instant';
    if (diffInMinutes < 60) return `Il y a ${diffInMinutes}min`;
    if (diffInMinutes < 1440) return `Il y a ${Math.floor(diffInMinutes / 60)}h`;
    return `Il y a ${Math.floor(diffInMinutes / 1440)}j`;
  };

  // Effets
  useEffect(() => {
    const auth = getAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        await loadNotifications();
        await loadStats();
      } else {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [showOnlyUnread, selectedType]);

  // Interface de chargement
  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <h1 className="text-2xl md:text-3xl font-bold text-primary">Notifications</h1>
          <Card className="card-hover w-full max-w-4xl mx-auto">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mr-3" />
                <span className="text-muted-foreground">Chargement des notifications...</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const unreadNotifications = notifications.filter(n => !n.isRead);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header avec stats */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-primary">Notifications</h1>
            {stats && (
              <p className="text-muted-foreground mt-1">
                {stats.unread} non lues sur {stats.total} total
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadNotifications(false)}
              disabled={refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              Actualiser
            </Button>

            {notifications.length > 0 && (
              <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Confirmer la suppression</DialogTitle>
                  </DialogHeader>
                  <p className="py-4">
                    Êtes-vous sûr de vouloir supprimer <strong>toutes vos notifications</strong> ({notifications.length}) ?
                    Cette action est irréversible.
                  </p>
                  <div className="flex justify-end gap-4 mt-4">
                    <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Annuler</Button>
                    <Button variant="destructive" onClick={deleteAllNotifications} disabled={deleting}>
                      {deleting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
                      Oui, tout supprimer
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {unreadNotifications.length > 0 && (
              <Button
                size="sm"
                onClick={markAllAsRead}
                disabled={markingAllRead}
                className="btn-teal"
              >
                {markingAllRead ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-1" />
                )}
                Tout marquer comme lu
              </Button>
            )}
          </div>
        </div>

        {/* Filtres */}
        <Card className="card-hover w-full max-w-4xl mx-auto">
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Filtres :</span>
              </div>
              
              <Button
                variant={showOnlyUnread ? "default" : "outline"}
                size="sm"
                onClick={() => setShowOnlyUnread(!showOnlyUnread)}
              >
                {showOnlyUnread ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
                {showOnlyUnread ? 'Toutes' : 'Non lues seulement'}
              </Button>

              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="px-3 py-1 border rounded-md text-sm bg-background"
              >
                <option value="all">Tous les types</option>
                <option value="DAILY_VALIDATION">Validations journée</option>
                <option value="PAIN_ALERT">Alertes douleur</option>
                <option value="PROGRAM_COMPLETED">Programmes terminés</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Liste des notifications */}
        <Card className="card-hover w-full max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Bell className="text-accent" /> 
              Vos Notifications
              {stats && stats.unread > 0 && (
                <span className="bg-destructive text-destructive-foreground text-xs px-2 py-1 rounded-full">
                  {stats.unread}
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Consultez ici les alertes et messages importants de vos patients.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {notifications.length > 0 ? (
              <ul className="space-y-4">
                {notifications.map(notification => (
                  <li 
                    key={notification.id} 
                    className={`p-4 rounded-md border transition-colors ${
                      notification.type === 'PROGRAM_COMPLETED'
                        ? notification.isRead
                          ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-300 dark:border-green-700 shadow-sm'
                          : 'bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/40 dark:to-emerald-900/40 border-green-400 dark:border-green-600 shadow-md font-medium'
                        : notification.isRead
                          ? 'bg-card border-border'
                          : 'bg-accent/10 border-accent font-medium'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-semibold ${
                          notification.type === 'PROGRAM_COMPLETED'
                            ? 'text-green-700 dark:text-green-400'
                            : notification.isRead
                              ? 'text-foreground'
                              : 'text-accent'
                        }`}>
                          {getNotificationIcon(notification.type)}
                          {notification.title}
                        </span>
                        
                        {!notification.isRead && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => markAsRead(notification.id)}
                            className="h-6 px-2 text-xs"
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Marquer comme lu
                          </Button>
                        )}
                      </div>
                      
                      <div className="text-right">
                        <span className="text-xs text-muted-foreground block">
                          {formatTimeAgo(notification.createdAt)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(notification.createdAt).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    </div>
                    
                    <div className="text-sm text-muted-foreground space-y-2">
                      <p>{notification.message}</p>
                      
                      {/* Informations spécifiques selon le type */}
                      {notification.type === 'PAIN_ALERT' && notification.metadata?.painLevel && (
                        <div className="bg-destructive/10 p-2 rounded border border-destructive/20">
                          <p className="text-destructive font-medium">
                            🚨 Niveau de douleur signalé : {notification.metadata.painLevel}/10
                          </p>
                          {notification.metadata.difficultyLevel && (
                            <p className="text-sm">
                              Difficulté : {notification.metadata.difficultyLevel}/10
                            </p>
                          )}
                        </div>
                      )}
                      
                      {/* 🔧 FIX: Nouvelle version pour PROGRAM_COMPLETED avec style amélioré */}
                      {notification.type === 'PROGRAM_COMPLETED' && notification.metadata?.adherenceText && (
                        <div className="bg-gradient-to-r from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 p-3 rounded-md border border-green-300 dark:border-green-700 shadow-sm">
                          <p className="text-green-800 dark:text-green-300 font-semibold text-base">
                            🎉 {notification.metadata.adherenceText}
                          </p>
                        </div>
                      )}
                      
                      {notification.type === 'DAILY_VALIDATION' && notification.metadata && (
                        <div className="bg-blue-50 dark:bg-blue-900/30 p-2 rounded border border-blue-200 dark:border-blue-700">
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            {notification.metadata.painLevel !== undefined && (
                              <span>Douleur: {notification.metadata.painLevel}/10</span>
                            )}
                            {notification.metadata.difficultyLevel !== undefined && (
                              <span>Difficulté: {notification.metadata.difficultyLevel}/10</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-center py-12">
                <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground text-lg font-medium">
                  {showOnlyUnread || selectedType !== 'all' 
                    ? 'Aucune notification correspondant aux filtres'
                    : 'Vous n\'avez aucune notification pour le moment'
                  }
                </p>
                <p className="text-muted-foreground text-sm mt-2">
                  Les notifications apparaîtront ici lorsque vos patients valideront leurs séances.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}