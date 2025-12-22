'use client';

import React, { useState, useRef } from 'react';
import { Upload, Loader2, CheckCircle, XCircle, Film, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { fetchWithAuth } from '@/utils/fetchWithAuth';

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

interface VideoUploadProps {
  gifUrl: string | null;
  onGifUrlChange: (url: string | null) => void;
}

export default function VideoUpload({ gifUrl, onGifUrlChange }: VideoUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ACCEPTED_FORMATS = ['video/mp4', 'video/quicktime', 'video/x-msvideo'];
  const MAX_SIZE_MB = 30;

  const validateFile = (file: File): string | null => {
    if (!ACCEPTED_FORMATS.includes(file.type)) {
      return 'Format non supporté. Formats acceptés : MP4, MOV, AVI';
    }

    const sizeInMB = file.size / (1024 * 1024);
    if (sizeInMB > MAX_SIZE_MB) {
      return `Fichier trop volumineux (${sizeInMB.toFixed(1)}MB). Taille max : ${MAX_SIZE_MB}MB`;
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

    setVideoFile(file);
    setIsUploading(true);
    setUploadProgress('Upload de la vidéo...');

    try {
      const formData = new FormData();
      formData.append('video', file);

      setUploadProgress('Conversion en GIF (peut prendre 10-30s)...');

      const res = await fetchWithAuth(`${apiUrl}/exercices/upload-video`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Erreur lors de l\'upload');
      }

      const data = await res.json();
      setUploadProgress('GIF généré avec succès !');
      onGifUrlChange(data.gifUrl);

      setTimeout(() => {
        setUploadProgress('');
      }, 2000);

    } catch (err) {
      console.error('Erreur upload vidéo:', err);
      setError(err instanceof Error ? err.message : 'Erreur lors de l\'upload');
      setVideoFile(null);
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
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleRemoveGif = () => {
    onGifUrlChange(null);
    setVideoFile(null);
    setError(null);
    setUploadProgress('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <Film className="w-4 h-4" />
        Vidéo de démonstration (optionnel)
      </Label>

      {gifUrl ? (
        <div className="space-y-3">
          <div className="relative rounded-lg border-2 border-green-500 bg-green-50 dark:bg-green-900/20 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-1" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-900 dark:text-green-100">
                  GIF de démonstration ajouté
                </p>
                <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                  Le GIF sera affiché dans le chat patient
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleRemoveGif}
                className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-100"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>

            <div className="mt-3 rounded-md overflow-hidden bg-white dark:bg-gray-800">
              <img
                src={gifUrl}
                alt="Aperçu du GIF"
                className="w-full max-w-xs mx-auto rounded-md"
                loading="lazy"
              />
            </div>
          </div>
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
                    Veuillez patienter...
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
                    Glissez une vidéo ou{' '}
                    <span className="text-blue-600">parcourez</span>
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    MP4, MOV, AVI • Max {MAX_SIZE_MB}MB
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

      <p className="text-xs text-gray-500 dark:text-gray-400">
        La vidéo sera automatiquement convertie en GIF optimisé (480p, ~2-3MB)
      </p>
    </div>
  );
}
