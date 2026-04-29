"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchWithAuth } from "@/utils/fetchWithAuth";
import { getAuth } from "firebase/auth";

interface PendingDocument {
  documentType: string;
  currentVersion: string;
  acceptedVersion: string | null;
}

interface LegalAcceptanceState {
  pendingDocuments: PendingDocument[];
  isLoading: boolean;
  needsAcceptance: boolean;
  refresh: () => void;
}

export function useLegalAcceptance(): LegalAcceptanceState {
  const [pendingDocuments, setPendingDocuments] = useState<PendingDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const checkStatus = useCallback(async () => {
    try {
      const auth = getAuth();
      if (!auth.currentUser) {
        setIsLoading(false);
        return;
      }

      const res = await fetchWithAuth(
        `${process.env.NEXT_PUBLIC_API_URL}/api/legal-acceptances/status`
      );

      if (!res.ok) {
        setIsLoading(false);
        return;
      }

      const data = await res.json();

      if (!data.allUpToDate) {
        const pending = Object.entries(data.documents)
          .filter(([, doc]) => !(doc as { upToDate: boolean }).upToDate)
          .map(([docType, doc]) => ({
            documentType: docType,
            currentVersion: (doc as { current: string }).current,
            acceptedVersion: (doc as { accepted: string | null }).accepted,
          }));
        setPendingDocuments(pending);
      } else {
        setPendingDocuments([]);
      }
    } catch {
      // En cas d'erreur, ne pas bloquer l'utilisateur
      setPendingDocuments([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  return {
    pendingDocuments,
    isLoading,
    needsAcceptance: pendingDocuments.length > 0,
    refresh: checkStatus,
  };
}
