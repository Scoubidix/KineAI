'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import {
  FolderOpen, Loader2, FileText, Trash2, Eye, AlertCircle,
  FileSearch, ArrowLeft, PenLine, Send, XCircle, Download, Inbox, SendHorizonal, Landmark, CheckCircle2
} from 'lucide-react';
import { useUser } from '@/context/UserContext';
import { matchesAllTokens } from '@/utils/textSearch';
import SignatureDialog from './SignatureDialog';
import EnvoiInvitationDialog from './EnvoiInvitationDialog';
import EnvoiOrdreDialog from './EnvoiOrdreDialog';

interface ContractRow {
  id: number;
  type: 'REMPLACEMENT_LIBERAL' | 'ASSISTANAT_LIBERAL';
  roleInitiateur: 'TITULAIRE' | 'REMPLACANT_OU_ASSISTANT';
  status: 'BROUILLON' | 'SIGNE_INITIATEUR' | 'ENVOYE' | 'COMPLETE' | 'ARCHIVE';
  role: 'INITIATEUR' | 'DESTINATAIRE';
  kineInitiateurId: number;
  kineDestinataireId: number | null;
  destinataireFirstName: string;
  destinataireLastName: string;
  destinataireEmail: string;
  pdfFinalUrl: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  ordreSentAt: string | null;
  ordreRecipientEmail: string | null;
  kineInitiateur?: { firstName: string; lastName: string; email: string };
}

type TabKey = 'INITIATEUR' | 'DESTINATAIRE';

interface MesContratsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refreshKey?: number; // bump pour forcer un refetch
}

const STATUS_LABELS: Record<ContractRow['status'], { label: string; color: string }> = {
  BROUILLON: { label: 'Brouillon', color: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
  SIGNE_INITIATEUR: { label: 'Signé par vous', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300' },
  ENVOYE: { label: 'Envoyé', color: 'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-300' },
  COMPLETE: { label: 'Complet', color: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300' },
  ARCHIVE: { label: 'Archivé', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
};

const TYPE_LABELS: Record<ContractRow['type'], string> = {
  REMPLACEMENT_LIBERAL: 'Remplacement libéral',
  ASSISTANAT_LIBERAL: 'Assistanat libéral',
};

export default function MesContratsModal({ open, onOpenChange, refreshKey }: MesContratsModalProps) {
  const { toast } = useToast();
  const user = useUser();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewContractId, setPreviewContractId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [signingContractId, setSigningContractId] = useState<number | null>(null);
  const [signing, setSigning] = useState(false);
  const [sendingContract, setSendingContract] = useState<ContractRow | null>(null);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [tab, setTab] = useState<TabKey>('INITIATEUR');
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [ordreContractId, setOrdreContractId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('ALL');

  const fetchContracts = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: 'Erreur', description: data.error || 'Chargement impossible', variant: 'destructive' });
        return;
      }
      const data = await res.json();
      setContracts(Array.isArray(data.contracts) ? data.contracts : []);
      // Marque comme vu pour effacer le badge unread
      fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/mark-viewed`, { method: 'POST' }).catch(() => {});
    } catch {
      toast({ title: 'Erreur', description: 'Erreur réseau', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadFinal = async (contractId: number) => {
    setDownloadingId(contractId);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/${contractId}/final-pdf`);
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'PDF indisponible', description: data.error || 'Erreur', variant: 'destructive' });
        return;
      }
      window.open(data.url, '_blank');
    } finally {
      setDownloadingId(null);
    }
  };

  // Années disponibles dérivées des createdAt (toutes catégories confondues), triées décroissant.
  const availableYears = useMemo(() => {
    const set = new Set<number>();
    contracts.forEach(c => {
      const d = new Date(c.createdAt);
      if (!Number.isNaN(d.getTime())) set.add(d.getFullYear());
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [contracts]);

  // Cible de recherche : on cherche dans l'autre partie (destinataire si je suis initiateur, sinon
  // initiateur). + email pour offrir un filtrage souple comme dans la liste patients.
  const searchTarget = (c: ContractRow) => c.role === 'INITIATEUR'
    ? `${c.destinataireFirstName} ${c.destinataireLastName} ${c.destinataireEmail}`
    : `${c.kineInitiateur?.firstName || ''} ${c.kineInitiateur?.lastName || ''} ${c.kineInitiateur?.email || ''}`;

  const filteredContracts = contracts.filter(c => {
    if (c.role !== tab) return false;
    if (yearFilter !== 'ALL') {
      const y = new Date(c.createdAt).getFullYear();
      if (String(y) !== yearFilter) return false;
    }
    if (search.trim() && !matchesAllTokens(searchTarget(c), search)) return false;
    return true;
  });
  const initiateurCount = contracts.filter(c => c.role === 'INITIATEUR').length;
  const destinataireCount = contracts.filter(c => c.role === 'DESTINATAIRE').length;

  useEffect(() => {
    if (open) {
      setPreviewContractId(null);
      setPreviewUrl(null);
      setPreviewError(null);
      setSearch('');
      setYearFilter('ALL');
      fetchContracts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, refreshKey]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handlePreview = async (contractId: number) => {
    setPreviewContractId(contractId);
    setPreviewLoading(true);
    setPreviewError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/${contractId}/preview-pdf`);
      if (!res.ok) {
        if (res.status === 503) {
          setPreviewError('La génération PDF est désactivée sur cet environnement (staging). Aperçu indisponible.');
        } else {
          const data = await res.json().catch(() => ({}));
          setPreviewError(data.error || 'Erreur lors du chargement du PDF');
        }
        return;
      }
      const blob = await res.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch {
      setPreviewError('Erreur réseau lors du chargement du PDF');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSignConfirm = async (signatureText: string, mention: string) => {
    if (!signingContractId) return;
    setSigning(true);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/${signingContractId}/sign-initiator`, {
        method: 'POST',
        body: JSON.stringify({ signatureText, mention }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Erreur', description: data.error || 'Signature impossible', variant: 'destructive' });
        return;
      }
      toast({ title: 'Contrat signé', description: 'Vous pouvez maintenant l\'envoyer au destinataire.' });
      setSigningContractId(null);
      // Refresh la liste pour voir le nouveau statut
      fetchContracts();
    } finally {
      setSigning(false);
    }
  };

  const handleRevoke = async (contractId: number) => {
    if (!confirm('Révoquer le lien envoyé au destinataire ? Le contrat redeviendra "Signé par vous" et vous pourrez le renvoyer.')) return;
    setRevokingId(contractId);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/${contractId}/revoke-invitation`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: 'Erreur', description: data.error || 'Révocation impossible', variant: 'destructive' });
        return;
      }
      toast({ title: 'Lien révoqué', description: 'Vous pouvez renvoyer un nouveau lien.' });
      fetchContracts();
    } finally {
      setRevokingId(null);
    }
  };

  const handleDelete = async (contractId: number) => {
    if (!confirm('Supprimer définitivement ce contrat ? Cette action est irréversible.')) return;
    setDeletingId(contractId);
    try {
      const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/api/contracts/${contractId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: 'Erreur', description: data.error || 'Suppression impossible', variant: 'destructive' });
        return;
      }
      setContracts(prev => prev.filter(c => c.id !== contractId));
      if (previewContractId === contractId) {
        setPreviewContractId(null);
        setPreviewUrl(null);
      }
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  const closePreview = () => {
    setPreviewContractId(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewError(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-5xl !w-[95vw] !max-h-[90vh] overflow-hidden p-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b bg-[#eef7f6] dark:bg-[#0f1c1b]">
          <DialogTitle className="flex items-center gap-2 text-[#3899aa]">
            {previewContractId ? <Eye className="h-5 w-5" /> : <FolderOpen className="h-5 w-5" />}
            {previewContractId ? `Aperçu du contrat #${previewContractId}` : 'Mes contrats'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {!previewContractId && (
            <>
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loading && contracts.length === 0 && (
                <div className="text-center py-12">
                  <FileSearch className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Aucun contrat pour le moment.</p>
                  <p className="text-xs text-muted-foreground mt-1">Créez votre premier contrat depuis la card "Nouveau contrat".</p>
                </div>
              )}
              {!loading && contracts.length > 0 && (
                <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
                  <TabsList className="mb-3">
                    <TabsTrigger value="INITIATEUR" className="gap-1.5">
                      <SendHorizonal className="h-4 w-4" /> Envoyés
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{initiateurCount}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="DESTINATAIRE" className="gap-1.5">
                      <Inbox className="h-4 w-4" /> Reçus
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">{destinataireCount}</Badge>
                    </TabsTrigger>
                  </TabsList>

                  <div className="flex flex-col sm:flex-row gap-2 mb-3">
                    <Input
                      placeholder="Rechercher (nom, mail...)"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="flex-1"
                    />
                    <Select value={yearFilter} onValueChange={setYearFilter}>
                      <SelectTrigger className="w-full sm:w-40">
                        <SelectValue placeholder="Toutes les années" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">Toutes les années</SelectItem>
                        {availableYears.map(y => (
                          <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(['INITIATEUR', 'DESTINATAIRE'] as TabKey[]).map(t => (
                    <TabsContent key={t} value={t} className="space-y-2 mt-0">
                      {filteredContracts.length === 0 && t === tab && (
                        <div className="text-center py-10">
                          <FileSearch className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
                          <p className="text-sm text-muted-foreground">
                            {search.trim() || yearFilter !== 'ALL'
                              ? 'Aucun contrat ne correspond aux filtres.'
                              : (tab === 'INITIATEUR' ? 'Aucun contrat envoyé.' : 'Aucun contrat reçu.')}
                          </p>
                        </div>
                      )}
                      {filteredContracts.map(c => {
                        const status = STATUS_LABELS[c.status];
                        const isMine = c.role === 'INITIATEUR';
                        const otherParty = isMine
                          ? `${c.destinataireFirstName} ${c.destinataireLastName}`
                          : `${c.kineInitiateur?.firstName || ''} ${c.kineInitiateur?.lastName || ''}`.trim();
                        return (
                          <div key={c.id} className="flex items-center gap-3 p-4 rounded-lg border border-border hover:border-[#3899aa]/40 transition-colors">
                            <FileText className="h-5 w-5 text-[#3899aa] shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{TYPE_LABELS[c.type]}</span>
                                <Badge variant="secondary" className={`text-[10px] ${status.color}`}>{status.label}</Badge>
                                {isMine && c.status === 'COMPLETE' && (
                                  c.ordreSentAt ? (
                                    <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300 inline-flex items-center gap-1">
                                      <CheckCircle2 className="h-3 w-3" /> Envoyé à l'Ordre
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                      À déclarer à l'Ordre
                                    </Badge>
                                  )
                                )}
                              </div>
                              <div className="text-xs text-muted-foreground truncate mt-1">
                                {isMine ? `Avec ${otherParty}` : `Reçu de ${otherParty}`}
                                {c.completedAt && (
                                  <>
                                    <span className="mx-1.5">•</span>
                                    <span>Signé le {formatDate(c.completedAt)}</span>
                                  </>
                                )}
                                {isMine && c.status === 'COMPLETE' && c.ordreSentAt && (
                                  <>
                                    <span className="mx-1.5">•</span>
                                    <span>Ordre le {formatDate(c.ordreSentAt)}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {isMine && c.status !== 'COMPLETE' && (
                                <Button size="sm" variant="ghost" onClick={() => handlePreview(c.id)} title="Aperçu">
                                  <Eye className="h-4 w-4" />
                                </Button>
                              )}
                              {isMine && c.status === 'COMPLETE' && !c.ordreSentAt && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setOrdreContractId(c.id)}
                                  title="Envoyer à l'Ordre"
                                  className="text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                                >
                                  <Landmark className="h-4 w-4" />
                                </Button>
                              )}
                              {c.status === 'COMPLETE' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDownloadFinal(c.id)}
                                  disabled={downloadingId === c.id}
                                  title="Télécharger le PDF final"
                                  className="text-[#3899aa] hover:bg-[#3899aa]/10"
                                >
                                  {downloadingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                                </Button>
                              )}
                              {isMine && c.status === 'BROUILLON' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSigningContractId(c.id)}
                                  title="Signer ce brouillon"
                                  className="text-[#3899aa] hover:bg-[#3899aa]/10"
                                >
                                  <PenLine className="h-4 w-4" />
                                </Button>
                              )}
                              {isMine && c.status === 'SIGNE_INITIATEUR' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSendingContract(c)}
                                  title="Envoyer au destinataire"
                                  className="text-[#3899aa] hover:bg-[#3899aa]/10"
                                >
                                  <Send className="h-4 w-4" />
                                </Button>
                              )}
                              {isMine && (c.status === 'BROUILLON' || c.status === 'SIGNE_INITIATEUR') && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDelete(c.id)}
                                  disabled={deletingId === c.id}
                                  title="Supprimer"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20"
                                >
                                  {deletingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                </Button>
                              )}
                              {isMine && c.status === 'ENVOYE' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setSendingContract(c)}
                                    title="Renvoyer le lien"
                                    className="text-[#3899aa] hover:bg-[#3899aa]/10"
                                  >
                                    <Send className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleRevoke(c.id)}
                                    disabled={revokingId === c.id}
                                    title="Révoquer le lien"
                                    className="text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
                                  >
                                    {revokingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </>
          )}

          {previewContractId && (
            <div className="space-y-3 h-full flex flex-col">
              <Button variant="ghost" size="sm" onClick={closePreview} className="self-start">
                <ArrowLeft className="h-4 w-4 mr-1" /> Retour à la liste
              </Button>
              {previewLoading && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-[#3899aa] mb-2" />
                  <p className="text-sm text-muted-foreground">Génération de l'aperçu...</p>
                </div>
              )}
              {previewError && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-900 dark:text-amber-100">{previewError}</div>
                </div>
              )}
              {previewUrl && (
                <iframe
                  src={previewUrl}
                  title="Aperçu PDF contrat"
                  className="w-full flex-1 min-h-[500px] border rounded-lg"
                />
              )}
            </div>
          )}
        </div>
      </DialogContent>

      <SignatureDialog
        open={signingContractId !== null}
        onOpenChange={(o) => { if (!o) setSigningContractId(null); }}
        expectedName={`${user?.firstName || ''} ${user?.lastName || ''}`.trim()}
        title="Signer le brouillon"
        description="Vous signez ce contrat en tant qu'initiateur."
        onConfirm={handleSignConfirm}
        submitting={signing}
      />

      <EnvoiInvitationDialog
        open={sendingContract !== null}
        onOpenChange={(o) => { if (!o) { setSendingContract(null); fetchContracts(); } }}
        contractId={sendingContract?.id || null}
        destinataireEmail={sendingContract?.destinataireEmail || ''}
        onSent={fetchContracts}
      />

      <EnvoiOrdreDialog
        open={ordreContractId !== null}
        onOpenChange={(o) => { if (!o) setOrdreContractId(null); }}
        contractId={ordreContractId}
        onSent={fetchContracts}
      />
    </Dialog>
  );
}
