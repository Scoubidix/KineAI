'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { useToast } from '@/hooks/use-toast';
import { formatStart, parseYouTubeUrl, youtubeWatchUrl } from '@/utils/youtube';
import TestGuideContent from '@/components/bilan/TestGuideContent';
import YouTubeFacade from '@/components/bilan/YouTubeFacade';
import type { AdminBilanGuide, AdminBilanGuideRow } from '@/types/bilan';

const API = process.env.NEXT_PUBLIC_API_URL;
const MAX_CONTENT = 5000;

interface BilanGuideEditorDialogProps {
  row: AdminBilanGuideRow | null;
  onClose: () => void;
  onSaved: (fieldKey: string, guide: AdminBilanGuide) => void;
}

/** Édition de la fiche d'un test : Markdown (Écrire / Aperçu) + lien YouTube facultatif. */
export default function BilanGuideEditorDialog({ row, onClose, onSaved }: BilanGuideEditorDialogProps) {
  const { toast } = useToast();
  const initialContent = row?.guide?.content ?? '';
  const initialVideoUrl = row?.guide?.youtubeId ? youtubeWatchUrl(row.guide.youtubeId, row.guide.youtubeStart) : '';
  const [content, setContent] = useState(initialContent);
  const [videoUrl, setVideoUrl] = useState(initialVideoUrl);
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Réinitialisation à chaque fiche ouverte
  useEffect(() => {
    setContent(initialContent);
    setVideoUrl(initialVideoUrl);
  }, [row?.fieldKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const video = useMemo(() => (videoUrl.trim() ? parseYouTubeUrl(videoUrl) : null), [videoUrl]);
  const videoInvalid = videoUrl.trim().length > 0 && !video;
  const dirty = content !== initialContent || videoUrl !== initialVideoUrl;

  const requestClose = () => {
    if (saving) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  };

  const handleSave = async () => {
    if (!row || videoInvalid) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth(`${API}/api/admin/bilan-guides/${encodeURIComponent(row.fieldKey)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, videoUrl: videoUrl.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Erreur');
      onSaved(row.fieldKey, json.guide);
      toast({ title: 'Fiche enregistrée', description: row.label });
      onClose();
    } catch (e) {
      toast({ title: 'Erreur', description: e instanceof Error ? e.message : "Impossible d'enregistrer la fiche", variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={row !== null} onOpenChange={(open) => { if (!open) requestClose(); }}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Fiche : {row?.label}</DialogTitle>
            <DialogDescription>{row?.category} · le bouton ⓘ apparaît pour les kinés dès que la description est remplie.</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="write">
            <TabsList>
              <TabsTrigger value="write">Écrire</TabsTrigger>
              <TabsTrigger value="preview">Aperçu</TabsTrigger>
            </TabsList>
            <TabsContent value="write" className="space-y-1.5 mt-3">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={MAX_CONTENT}
                rows={14}
                placeholder="Réalisation, critère positif, interprétation…"
                aria-label="Description du test"
              />
              <div className="flex justify-between gap-2 text-[11px] text-muted-foreground">
                <span>**gras** · - liste · [lien](https://…)</span>
                <span>{content.length} / {MAX_CONTENT}</span>
              </div>
            </TabsContent>
            <TabsContent value="preview" className="mt-3 space-y-4 rounded-md border p-4">
              {content.trim() ? <TestGuideContent content={content} /> : <p className="text-sm text-muted-foreground">Aucune description : pas de bouton ⓘ côté kiné.</p>}
              {video && <YouTubeFacade videoId={video.id} start={video.start} title={row?.label ?? ''} />}
            </TabsContent>
          </Tabs>

          <div className="space-y-1.5">
            <Label htmlFor="guide-video">Lien YouTube (facultatif)</Label>
            <Input
              id="guide-video"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=… ou https://youtu.be/…"
              aria-invalid={videoInvalid}
              aria-describedby="guide-video-status"
            />
            <p id="guide-video-status" className={`text-[11px] ${videoInvalid ? 'text-destructive' : 'text-muted-foreground'}`}>
              {videoInvalid
                ? 'Lien YouTube non reconnu.'
                : video
                  ? `Vidéo reconnue${video.start ? `, démarre à ${formatStart(video.start)}` : ''} — visible dans l’Aperçu.`
                  : 'Ajoute &t=1m30s au lien pour démarrer la vidéo au bon moment.'}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={requestClose} disabled={saving}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving || videoInvalid || !dirty} className="btn-teal">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abandonner les modifications ?</AlertDialogTitle>
            <AlertDialogDescription>Les changements de cette fiche ne sont pas enregistrés.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuer l’édition</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmDiscard(false); onClose(); }}>Abandonner</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
