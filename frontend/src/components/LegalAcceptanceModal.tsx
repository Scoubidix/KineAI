"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { fetchWithAuth } from "@/utils/fetchWithAuth";
import { useToast } from "@/hooks/use-toast";

interface PendingDocument {
  documentType: string;
  currentVersion: string;
  acceptedVersion: string | null;
}

interface LegalAcceptanceModalProps {
  pendingDocuments: PendingDocument[];
  onAccepted: () => void;
  onClose: () => void;
}

const DOCUMENT_LABELS: Record<string, { label: string; url: string }> = {
  CGU: {
    label: "Conditions Générales d'Utilisation (CGU)",
    url: "/legal/cgu.html",
  },
  POLITIQUE_CONFIDENTIALITE: {
    label: "Politique de Confidentialité",
    url: "/legal/politique-confidentialite.html",
  },
  DPA: {
    label: "Contrat de Sous-traitance (DPA)",
    url: "/legal/dpa.html",
  },
};

export default function LegalAcceptanceModal({
  pendingDocuments,
  onAccepted,
  onClose,
}: LegalAcceptanceModalProps) {
  const [checkedDocs, setCheckedDocs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const allChecked = pendingDocuments.every(
    (doc) => checkedDocs[doc.documentType]
  );

  const handleToggle = (docType: string) => {
    setCheckedDocs((prev) => ({ ...prev, [docType]: !prev[docType] }));
  };

  const handleAccept = async () => {
    setLoading(true);
    try {
      const acceptances = pendingDocuments.map((doc) => ({
        documentType: doc.documentType,
        version: doc.currentVersion,
      }));

      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/api/legal-acceptances`,
        {
          method: "POST",
          body: JSON.stringify({ acceptances }),
        }
      );

      if (!res.ok) {
        throw new Error("Erreur lors de l'enregistrement des acceptations");
      }

      onAccepted();
    } catch {
      toast({
        variant: "destructive",
        title: "Erreur",
        description:
          "Impossible d'enregistrer vos acceptations. Veuillez réessayer.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mise à jour des documents légaux</DialogTitle>
          <DialogDescription>
            De nouvelles versions de nos documents légaux sont disponibles. Veuillez les accepter pour continuer à utiliser la plateforme.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {pendingDocuments.map((doc) => {
            const info = DOCUMENT_LABELS[doc.documentType];
            if (!info) return null;

            return (
              <div
                key={doc.documentType}
                className="flex items-start space-x-3"
              >
                <input
                  type="checkbox"
                  id={`legal-${doc.documentType}`}
                  checked={checkedDocs[doc.documentType] || false}
                  onChange={() => handleToggle(doc.documentType)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                  disabled={loading}
                />
                <label
                  htmlFor={`legal-${doc.documentType}`}
                  className="text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                >
                  J&apos;ai lu et j&apos;accepte{" "}
                  {doc.documentType === "POLITIQUE_CONFIDENTIALITE"
                    ? "la "
                    : doc.documentType === "DPA"
                      ? "le "
                      : "les "}
                  <a
                    href={info.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-600 underline hover:text-teal-800"
                  >
                    {info.label}
                  </a>
                  {doc.acceptedVersion && (
                    <span className="text-xs text-gray-400 ml-1">
                      (v{doc.acceptedVersion} → v{doc.currentVersion})
                    </span>
                  )}
                </label>
              </div>
            );
          })}
        </div>

        <Button
          onClick={handleAccept}
          disabled={!allChecked || loading}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Enregistrement...
            </div>
          ) : (
            "Accepter et continuer"
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
