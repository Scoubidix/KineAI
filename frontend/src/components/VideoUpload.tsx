'use client';

import React, { useState, useRef } from 'react';
import { Upload, Loader2, CheckCircle, XCircle, AlertTriangle, Film, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { ExerciceMedia } from '@/components/ExerciceMedia';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

/** Les six champs média d'un exercice, tels qu'ils circulent dans les formulaires. */
export interface ExerciceMediaValue {
  videoUrl: string | null;
  videoPath: string | null;
  posterUrl: string | null;
  posterPath: string | null;
  /** Legacy : lecture seule ici. Une vidéo qui arrive l'efface. */
  gifUrl: string | null;
  gifPath: string | null;
}

export const EMPTY_MEDIA: ExerciceMediaValue = {
  videoUrl: null, videoPath: null,
  posterUrl: null, posterPath: null,
  gifUrl: null, gifPath: null,
};

interface VideoUploadProps {
  value: ExerciceMediaValue;
  onChange: (value: ExerciceMediaValue) => void;
}

export default function VideoUpload({ value, onChange }: VideoUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ACCEPTED_FORMATS = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
  const MAX_SIZE_MB = 50; // doit rester aligné sur VIDEO_CONFIG.maxSizeMB côté backend
  const MAX_DURATION_S = 15;

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_FORMATS.includes(file.type)) {
      return 'Format non supporté. Formats acceptés : MP4, MOV, AVI';
    }
    const sizeInMB = file.size / (1024 * 1024);
    if (sizeInMB > MAX_SIZE_MB) {
      // Même formulation que le backend : le kiné doit savoir quoi faire, pas
      // seulement que c'est refusé.
      return `Vidéo trop lourde (${Math.round(sizeInMB)} Mo, maximum ${MAX_SIZE_MB} Mo). Filme en 1080p plutôt qu'en 4K, ou raccourcis la séquence.`;
    }
    return null;
  };

  const handleFile = async (file: File) => {
    setError(null);

    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsUploading(true);
    setUploadProgress('Envoi de la vidéo...');

    try {
      const formData = new FormData();
      formData.append('video', file);

      setUploadProgress('Préparation de la vidéo (20-60 s)...');

      const res = await fetchWithAuth(`${apiUrl}/exercices/upload-video`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Erreur lors de l'upload");
      }

      const data = await res.json();
      setUploadProgress('Vidéo prête !');
      setDimensions(data.width && data.height ? { width: data.width, height: data.height } : null);

      // La vidéo remplace le GIF legacy, ici comme en base : sans ça l'état
      // resterait ambigu entre le formulaire et le serveur.
      onChange({
        videoUrl: data.videoUrl,
        videoPath: data.videoPath,
        posterUrl: data.posterUrl,
        posterPath: data.posterPath,
        gifUrl: null,
        gifPath: null,
      });

      setTimeout(() => setUploadProgress(''), 2000);
    } catch (err) {
      console.error('Erreur upload vidéo:', err);
      setError(err instanceof Error ? err.message : "Erreur lors de l'upload");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Vider l'input quoi qu'il arrive : un `<input type="file">` qui garde sa
    // valeur ne réémet pas `change` si l'utilisateur resélectionne le MÊME
    // fichier. Après un échec — coupure réseau, refus de taille — le kiné
    // cliquerait alors sur son fichier sans que rien ne se passe, et sans le
    // moindre retour. Le glisser-déposer n'est pas concerné (aucun input).
    e.target.value = '';
    if (file) {
      handleFile(file);
    }
  };

  const handleRemoveMedia = () => {
    onChange(EMPTY_MEDIA);
    setDimensions(null);
    setError(null);
    setUploadProgress('');
    // Pas de remise à zéro de `fileInputRef` ici : l'input ne vit que dans la
    // branche « aucun média », donc il est déjà démonté quand ce bouton existe.
    // C'est son remontage, quand `hasMedia` repasse à false, qui le vide.
  };

  const hasMedia = Boolean(value.videoUrl || value.gifUrl);
  const isPortrait = dimensions !== null && dimensions.height > dimensions.width;

  return (
    <div className="space-y-3">
      <Label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Film className="w-4 h-4" />
        Vidéo de démonstration (optionnel)
      </Label>

      {hasMedia ? (
        <div className="space-y-3">
          <div className="relative rounded-lg border-2 border-green-500 bg-green-50 dark:bg-green-900/20 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-1" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-900 dark:text-green-100">
                  {value.videoUrl ? 'Vidéo de démonstration ajoutée' : 'GIF de démonstration (ancien format)'}
                </p>
                <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                  {value.videoUrl
                    ? 'Elle sera affichée dans le chat de tes patients.'
                    : 'Envoie une nouvelle vidéo pour la remplacer : tes patients verront un mouvement net.'}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleRemoveMedia}
                aria-label="Retirer le média"
                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-100"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            {/* Aperçu au cadrage exact de la vignette : le kiné voit ce que
                verront ses patients avant de valider, plutôt qu'après. */}
            <div className="mt-3">
              <ExerciceMedia
                videoUrl={value.videoUrl}
                posterUrl={value.posterUrl}
                gifUrl={value.gifUrl}
                alt="Aperçu de la démonstration"
                className="mx-auto aspect-video w-full max-w-xs rounded-md bg-muted"
                autoPlayOnHover
              />
              <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
                Aperçu du cadrage affiché sur les vignettes.
              </p>
            </div>
          </div>

          {/* Conseillé, pas imposé : bloquer un kiné entre deux patients ne lui
              laisse aucun recours. La vidéo entière est conservée, seul le
              cadrage de la vignette rogne les côtés. */}
          {isPortrait && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
              {/* `AlertTriangle` et non `XCircle` : ce bandeau conseille, il ne
                  refuse rien. Une icône d'erreur contredirait le message. */}
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Vidéo filmée à la verticale : sur la vignette, seuls les côtés seront
                rognés — la vidéo complète reste visible en grand. Pour un cadrage
                idéal, filme à l&apos;horizontale.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-lg p-6 transition-all duration-200
            ${isDragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
            }
            ${isUploading ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
          `}
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/x-msvideo"
            onChange={handleFileInput}
            className="hidden"
            disabled={isUploading}
          />

          <div className="flex flex-col items-center justify-center space-y-3">
            {isUploading ? (
              <>
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {uploadProgress}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Patiente...
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-blue-600" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Glisse une vidéo ou{' '}
                    <span className="text-blue-600">parcours</span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    MP4, MOV, AVI • Max {MAX_SIZE_MB} Mo
                  </p>
                  {/* Rappelé ici aussi : c'est le moment où le kiné choisit son
                      fichier, donc le dernier où le conseil peut encore servir.
                      Le bandeau ambre, lui, n'arrive qu'après l'envoi. */}
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mt-1">
                    Filme à l&apos;horizontale, téléphone couché
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-900 dark:text-red-100">
              Erreur
            </p>
            <p className="text-xs text-red-700 dark:text-red-300 mt-1">
              {error}
            </p>
          </div>
        </div>
      )}

      {/* Le conseil de cadrage passe avant les contraintes : c'est le seul point
          sur lequel le kiné peut encore agir au moment où il lit cette ligne. Le
          format technique de sortie, lui, ne le concerne pas. */}
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Filme <span className="font-medium text-gray-700 dark:text-gray-300">à l&apos;horizontale</span>,
        téléphone couché : c&apos;est le cadrage des vignettes, et tes patients voient
        tout le mouvement. Durée max : {MAX_DURATION_S} secondes. Taille max : {MAX_SIZE_MB} Mo.
      </p>
    </div>
  );
}
