'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import DOMPurify from 'dompurify';
import AppLayout from '@/components/AppLayout';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { FileText, FilePlus2, Loader2, Copy, Sparkles, Mail, Download, Lock, Lightbulb, ArrowLeft, Search, UserPlus, Check, History, ArrowRight, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase/config';
import { fetchWithAuth } from '@/utils/fetchWithAuth';
import { PaywallModal } from '@/components/PaywallModal';
import { usePaywall } from '@/hooks/usePaywall';
import { useToast } from '@/hooks/use-toast';
import MeasurementsPanel from '../components/MeasurementsPanel';
import CompareWithPreviousModal, { SelectedBilan } from '../components/CompareWithPreviousModal';
import TemplateEditorModal from '../components/TemplateEditorModal';
import BilanDetailView from '../components/BilanDetailView';
import { BilanType, StructuredData, EMPTY_STRUCTURED_DATA, BILAN_TYPE_LABELS, BILAN_TYPE_COLORS, CanonicalField, TemplateItem } from '@/types/bilan';

interface PatientOption {
  id: number;
  firstName: string;
  lastName: string;
  birthDate: string;
}

const isValidBilanType = (t: string | null): t is BilanType =>
  t === 'INITIAL' || t === 'INTERMEDIAIRE' || t === 'FINAL';

export default function BilanKinePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Params depuis l'URL (modal Nouveau bilan)
  const patientIdParam = searchParams.get('patientId');
  const typeParam = searchParams.get('type');
  const presetPatientId = patientIdParam ? parseInt(patientIdParam) : null;
  const presetType: BilanType = isValidBilanType(typeParam) ? typeParam : 'INITIAL';

  const [rawNotes, setRawNotes] = useState('');
  const [motifConsultation, setMotifConsultation] = useState('');
  const [structuredBilan, setStructuredBilan] = useState('');
  const [bilanHtml, setBilanHtml] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPreviewResult, setIsPreviewResult] = useState(false);
  const [showBilan, setShowBilan] = useState(false);
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);
  const [kineProfile, setKineProfile] = useState<{ firstName: string; lastName: string; adresseCabinet?: string; rpps?: string } | null>(null);
  const [showPatientModal, setShowPatientModal] = useState(false);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  const [savingBilan, setSavingBilan] = useState(false);
  const [savedPatient, setSavedPatient] = useState<PatientOption | null>(null);
  const bilanRef = useRef<HTMLDivElement>(null);

  // Nouveaux états : type, mesures structurées, comparaison, patient préselectionné
  const [bilanType, setBilanType] = useState<BilanType>(presetType);
  const [structuredData, setStructuredData] = useState<StructuredData>(EMPTY_STRUCTURED_DATA);
  const [presetPatient, setPresetPatient] = useState<PatientOption | null>(null);
  // Bilans antérieurs sélectionnés pour la comparaison (multi-sélection)
  const [previousBilans, setPreviousBilans] = useState<SelectedBilan[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [canonicalFields, setCanonicalFields] = useState<CanonicalField[]>([]);
  // Sauvegarde en template privé depuis la composition de mesures actuelle
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [saveTemplateInitialItems, setSaveTemplateInitialItems] = useState<TemplateItem[]>([]);
  // Visualisation d'un bilan antérieur en lecture seule depuis le récap de comparaison
  const [viewingPreviousBilan, setViewingPreviousBilan] = useState<SelectedBilan | null>(null);

  // Injecter le HTML dans le div contentEditable sans que React ne contrôle le contenu
  useEffect(() => {
    if (bilanRef.current && bilanHtml) {
      bilanRef.current.innerHTML = bilanHtml;
    }
  }, [bilanHtml]);

  const { subscription } = usePaywall();
  const { toast } = useToast();

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

  const getAuthToken = async () => {
    const auth = getAuth(app);
    return await auth.currentUser?.getIdToken();
  };

  // Charger le profil kiné au montage
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = await getAuthToken();
        if (!token) return;
        const res = await fetch(`${API_BASE}/kine/profile`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setKineProfile(data);
        }
      } catch (error) {
        console.error('Erreur chargement profil kiné:', error);
      }
    };
    fetchProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Charger le patient préselectionné depuis l'URL si présent
  useEffect(() => {
    if (!presetPatientId) return;
    const fetchPatient = async () => {
      try {
        const profileRes = await fetchWithAuth(`${API_BASE}/kine/profile`);
        if (!profileRes.ok) return;
        const profile = await profileRes.json();
        const patientsRes = await fetchWithAuth(`${API_BASE}/patients/kine/${profile.id}`);
        if (!patientsRes.ok) return;
        const list: PatientOption[] = await patientsRes.json();
        const found = list.find((p) => p.id === presetPatientId);
        if (found) setPresetPatient(found);
      } catch {
        // silent
      }
    };
    fetchPatient();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetPatientId]);

  // Charger les champs canoniques (utilisés pour formater les mesures envoyées à l'IA)
  useEffect(() => {
    const fetchFields = async () => {
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/bilan-fields`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.success) setCanonicalFields(json.fields);
      } catch {
        // silent
      }
    };
    fetchFields();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Formate une valeur canonique pour affichage (utilisé dans message IA et tableau HTML)
  const formatCanonicalValue = (field: CanonicalField, value: number | boolean | string): string => {
    if (field.type === 'BOOLEAN') return value === true ? 'positif' : 'négatif';
    if (field.type === 'NUMERIC') return `${value}${field.unit ? ` ${field.unit}` : ''}`;
    return String(value);
  };

  // Formate les mesures structurées en texte pour l'envoyer à l'IA dans le message.
  // Les valeurs null (champ ajouté mais non saisi) ou strings vides sont ignorées.
  // L'ordre suit data.measurements (= ordre choisi via template ou ajout manuel).
  const formatStructuredDataAsText = (data: StructuredData, fieldsByKey: Map<string, CanonicalField>): string => {
    const lines: string[] = [];
    for (const m of data.measurements) {
      if (m.kind === 'canonical') {
        if (m.value === null || m.value === undefined) continue;
        if (typeof m.value === 'string' && m.value.trim() === '') continue;
        const field = fieldsByKey.get(m.key);
        if (!field) continue;
        lines.push(`- ${field.label} : ${formatCanonicalValue(field, m.value)}`);
      } else {
        if (m.value.trim()) lines.push(`- ${m.label} : ${m.value}`);
      }
    }
    return lines.join('\n');
  };

  // Échappe les caractères HTML dangereux dans une chaîne destinée au DOM
  const escapeHtml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // Construit déterministiquement les tableaux HTML d'évolution des mesures.
  // Supporte 1 à N bilans antérieurs + le bilan en cours. Génère un tableau par
  // catégorie (depuis BilanCanonicalField.category) + section "Mesures libres"
  // pour les customs. Chaque tableau a 1 colonne par bilan (triés par date) +
  // une colonne "Évolution" (delta total = dernier - premier).
  // page-break-inside: avoid sur chaque tableau pour éviter les coupures PDF.
  const buildComparisonTableHtml = (
    current: StructuredData,
    previousBilansList: SelectedBilan[],
    fieldsByKey: Map<string, CanonicalField>,
    currentType: BilanType,
  ): string => {
    if (previousBilansList.length === 0) return '';

    const CUSTOM_CATEGORY = 'Mesures libres';
    const UNKNOWN_CATEGORY = 'Autres';

    const cellStyle = 'border:1px solid #999;padding:4px 8px;text-align:left';
    const headerStyle = `${cellStyle};background:#f0f0f0;font-weight:bold`;

    // Tri chronologique (du plus ancien au plus récent), bilan actuel en dernier
    const sortedPrevious = [...previousBilansList].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const currentDateIso = new Date().toISOString();
    const allBilans = [
      ...sortedPrevious.map((b) => ({
        type: b.type,
        createdAt: b.createdAt,
        data: b.structuredData ?? EMPTY_STRUCTURED_DATA,
        isCurrent: false,
      })),
      {
        type: currentType,
        createdAt: currentDateIso,
        data: current,
        isCurrent: true,
      },
    ];

    // Helpers (lookup dans la liste plate measurements)
    const getCanonicalValue = (data: StructuredData, key: string): number | boolean | string | null => {
      const m = data.measurements.find((x) => x.kind === 'canonical' && x.key === key);
      if (!m || m.kind !== 'canonical') return null;
      const v = m.value;
      if (v === null || v === undefined) return null;
      if (typeof v === 'string' && v.trim() === '') return null;
      return v;
    };
    const getCustomValue = (data: StructuredData, label: string): string | null => {
      const target = label.trim().toLowerCase();
      const m = data.measurements.find(
        (x) => x.kind === 'custom' && x.label.trim().toLowerCase() === target,
      );
      if (!m || m.kind !== 'custom' || !m.value.trim()) return null;
      return m.value;
    };

    // Collecte des keys/labels présents dans au moins un bilan, en préservant
    // l'ordre d'apparition (commencer par le bilan actuel pour que les mesures
    // ajoutées récemment apparaissent en haut de leur catégorie).
    const allCanonicalKeys: string[] = [];
    const seenKeys = new Set<string>();
    for (const b of [...allBilans].reverse()) {
      for (const m of b.data.measurements) {
        if (m.kind !== 'canonical') continue;
        if (seenKeys.has(m.key)) continue;
        if (getCanonicalValue(b.data, m.key) !== null) {
          seenKeys.add(m.key);
          allCanonicalKeys.push(m.key);
        }
      }
    }

    const allCustomLabels: string[] = [];
    const seenLabels = new Set<string>();
    for (const b of [...allBilans].reverse()) {
      for (const m of b.data.measurements) {
        if (m.kind !== 'custom') continue;
        const lk = m.label.trim().toLowerCase();
        if (seenLabels.has(lk)) continue;
        if (m.value.trim()) {
          seenLabels.add(lk);
          allCustomLabels.push(m.label.trim());
        }
      }
    }

    // Regrouper par catégorie en préservant l'ordre d'apparition (Map JS)
    const groups = new Map<string, { canonical: string[]; custom: string[] }>();
    for (const key of allCanonicalKeys) {
      const field = fieldsByKey.get(key);
      const cat = field?.category ?? UNKNOWN_CATEGORY;
      if (!groups.has(cat)) groups.set(cat, { canonical: [], custom: [] });
      groups.get(cat)!.canonical.push(key);
    }
    if (allCustomLabels.length > 0) {
      groups.set(CUSTOM_CATEGORY, { canonical: [], custom: allCustomLabels });
    }

    if (groups.size === 0) return '';

    // En-tête de tableau (identique pour chaque section)
    const headerCells: string[] = [`<th style="${headerStyle}">Mesure</th>`];
    for (const b of allBilans) {
      const dateStr = new Date(b.createdAt).toLocaleDateString('fr-FR');
      headerCells.push(`<th style="${headerStyle}">${escapeHtml(BILAN_TYPE_LABELS[b.type])} (${dateStr})</th>`);
    }
    headerCells.push(`<th style="${headerStyle}">Évolution</th>`);
    const tableHeader = `<thead><tr>${headerCells.join('')}</tr></thead>`;

    const cellsForRow = (cells: string[]) =>
      cells.map((c) => `<td style="${cellStyle}">${c}</td>`).join('');

    // Génère une ligne pour une mesure canonique
    const renderCanonicalRow = (key: string): string | null => {
      const field = fieldsByKey.get(key);
      if (!field) return null;
      const cells: string[] = [escapeHtml(field.label)];
      const numericValues: number[] = [];

      for (const b of allBilans) {
        const v = getCanonicalValue(b.data, key);
        if (v === null) {
          cells.push('—');
        } else {
          cells.push(escapeHtml(formatCanonicalValue(field, v)));
          if (field.type === 'NUMERIC' && typeof v === 'number') numericValues.push(v);
        }
      }

      let delta = '—';
      if (field.type === 'NUMERIC' && numericValues.length >= 2) {
        const diff = numericValues[numericValues.length - 1] - numericValues[0];
        if (diff === 0) delta = '=';
        else delta = `${diff > 0 ? '+' : ''}${diff}${field.unit ? ` ${field.unit}` : ''}`;
      } else {
        const presentValues = allBilans
          .map((b) => getCanonicalValue(b.data, key))
          .filter((v) => v !== null);
        if (presentValues.length >= 2) {
          const allEqual = presentValues.every((v) => v === presentValues[0]);
          delta = allEqual ? '=' : '→';
        }
      }
      cells.push(escapeHtml(delta));
      return `<tr>${cellsForRow(cells)}</tr>`;
    };

    // Génère une ligne pour une mesure custom
    const renderCustomRow = (label: string): string => {
      const cells: string[] = [escapeHtml(label)];
      const presentValues: string[] = [];

      for (const b of allBilans) {
        const v = getCustomValue(b.data, label);
        if (v === null) {
          cells.push('—');
        } else {
          cells.push(escapeHtml(v));
          presentValues.push(v.trim().toLowerCase());
        }
      }

      let delta = '—';
      if (presentValues.length >= 2) {
        const allEqual = presentValues.every((v) => v === presentValues[0]);
        delta = allEqual ? '=' : '→';
      }
      cells.push(escapeHtml(delta));
      return `<tr>${cellsForRow(cells)}</tr>`;
    };

    // Construction des sections par catégorie
    const sections: string[] = [];
    for (const [category, content] of groups.entries()) {
      const rows: string[] = [];
      for (const key of content.canonical) {
        const row = renderCanonicalRow(key);
        if (row) rows.push(row);
      }
      for (const label of content.custom) rows.push(renderCustomRow(label));
      if (rows.length === 0) continue;

      sections.push(
        `<h3 style="font-weight:bold;margin-top:0.8em;margin-bottom:0.3em">${escapeHtml(category)}</h3>` +
          `<table style="border-collapse:collapse;width:100%;margin:0.2em 0 0.6em 0;page-break-inside:avoid">${tableHeader}<tbody>${rows.join('')}</tbody></table>`
      );
    }

    if (sections.length === 0) return '';

    return `<h2 style="font-weight:bold;margin-top:1.2em;margin-bottom:0.5em">Évolution des mesures</h2>${sections.join('')}`;
  };

  const handleGenerateBilan = async () => {
    if (!rawNotes.trim()) {
      toast({
        title: "Notes vides",
        description: "Veuillez entrer vos notes cliniques avant de générer le bilan",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsGenerating(true);
      const token = await getAuthToken();

      const fieldsByKey = new Map(canonicalFields.map((f) => [f.key, f]));
      const measuresText = formatStructuredDataAsText(structuredData, fieldsByKey);

      // L'IA ne reçoit QUE les données du bilan en cours. La comparaison avec un
      // bilan antérieur est gérée par un tableau déterministe construit côté client
      // après la génération (cf. ci-dessous). Cela évite que l'IA signale des
      // mesures absentes ou redécrive le bilan précédent.
      const messageParts: string[] = [];
      messageParts.push(`TYPE DE BILAN : ${BILAN_TYPE_LABELS[bilanType]}`);
      if (motifConsultation.trim()) {
        messageParts.push(`MOTIF DE CONSULTATION : ${motifConsultation}`);
      }
      messageParts.push(`NOTES CLINIQUES :\n${rawNotes}`);
      if (measuresText) {
        messageParts.push(`MESURES À INTÉGRER DANS LE BILAN :\n${measuresText}`);
      }
      const message = messageParts.join('\n\n');

      const res = await fetch(`${API_BASE}/api/chat/kine/ia-administrative`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          message,
          conversationHistory: [],
          // Champs additionnels prêts pour le futur prompt IA structuré (Phase 2)
          bilanType,
          structuredData,
          previousBilanIds: previousBilans.map((b) => b.id),
        })
      });

      const data = await res.json();

      if (data.success) {
        // HTML narratif produit par l'IA (uniquement les notes + mesures actuelles)
        let finalHtml = renderMarkdown(data.message);

        // Si au moins 1 bilan antérieur est sélectionné, on concatène un tableau
        // d'évolution construit déterministiquement côté client. L'IA n'est pas
        // impliquée dans cette section : présentation toujours identique, aucun
        // risque d'hallucination, support multi-bilans natif.
        if (previousBilans.length > 0) {
          const tableHtml = buildComparisonTableHtml(
            structuredData,
            previousBilans,
            fieldsByKey,
            bilanType,
          );
          if (tableHtml) {
            finalHtml = finalHtml + DOMPurify.sanitize(tableHtml);
          }
        }

        setStructuredBilan(data.message);
        setBilanHtml(finalHtml);
        setIsPreviewResult(data.preview === true);
        setShowBilan(true);
      } else {
        toast({
          title: "Erreur",
          description: data.error || 'Erreur lors de la génération du bilan',
          variant: "destructive",
        });
      }

    } catch (error) {
      console.error('Erreur génération bilan:', error);
      toast({
        title: "Erreur technique",
        description: 'Une erreur est survenue lors de la génération',
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Convertit la composition de mesures en cours en items de template (sans valeurs)
  // et ouvre la modal de création de template privé. L'ordre du panneau est
  // préservé tel quel dans le template.
  const handleOpenSaveTemplateModal = () => {
    const items: TemplateItem[] = [];
    for (const m of structuredData.measurements) {
      if (m.kind === 'canonical') {
        items.push({ kind: 'canonical', key: m.key });
      } else {
        const label = m.label.trim();
        if (label) items.push({ kind: 'custom', label });
      }
    }
    setSaveTemplateInitialItems(items);
    setShowSaveTemplateModal(true);
  };

  const handleOpenPatientModal = async () => {
    try {
      const token = await getAuthToken();
      if (!token) return;
      // Récupérer le kineId depuis le profil déjà chargé, puis les patients
      const res = await fetchWithAuth(`${API_BASE}/kine/profile`);
      if (!res.ok) throw new Error();
      const profile = await res.json();
      const patientsRes = await fetchWithAuth(`${API_BASE}/patients/kine/${profile.id}`);
      if (!patientsRes.ok) throw new Error();
      const data = await patientsRes.json();
      setPatients(data);
      setPatientSearch('');
      setSavedPatient(null);
      setShowPatientModal(true);
    } catch {
      toast({ title: 'Erreur', description: 'Impossible de charger la liste des patients', variant: 'destructive' });
    }
  };

  const handleSaveBilanToPatient = async (patient: PatientOption) => {
    try {
      setSavingBilan(true);
      const res = await fetchWithAuth(`${API_BASE}/api/patients/${patient.id}/bilans`, {
        method: 'POST',
        body: JSON.stringify({
          motif: motifConsultation.trim() || undefined,
          rawNotes,
          bilanHtml: getBilanHtml(),
          type: bilanType,
          structuredData,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSavedPatient(patient);
      } else {
        toast({ title: 'Erreur', description: data.error || 'Erreur lors de la sauvegarde', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erreur', description: 'Erreur lors de la sauvegarde du bilan', variant: 'destructive' });
    } finally {
      setSavingBilan(false);
    }
  };

  // Enregistrement direct quand le patient est préselectionné (skip modal)
  const handleSaveDirectly = async () => {
    if (!presetPatient) return;
    await handleSaveBilanToPatient(presetPatient);
    setShowPatientModal(true); // ouvre quand même la modal pour afficher la confirmation + PDF
  };

  const handleDownloadPatientPDF = () => {
    if (!savedPatient) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Erreur', description: 'Veuillez autoriser les fenêtres pop-up', variant: 'destructive' });
      return;
    }

    const formattedHTML = getBilanHtml();
    const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    const logoUrl = `${window.location.origin}/logo.png`;
    const patientBirthDate = new Date(savedPatient.birthDate).toLocaleDateString('fr-FR');

    let headerHTML = '';
    if (kineProfile) {
      const name = `${kineProfile.firstName} ${kineProfile.lastName.toUpperCase()}`;
      headerHTML = `
        <div class="header">
          <div class="header-left">
            <div class="header-name">${DOMPurify.sanitize(name)}</div>
            <div>Masseur-Kinésithérapeute D.E.</div>
            ${kineProfile.rpps ? `<div>RPPS : ${DOMPurify.sanitize(kineProfile.rpps)}</div>` : ''}
            ${kineProfile.adresseCabinet ? `<div>${DOMPurify.sanitize(kineProfile.adresseCabinet)}</div>` : ''}
          </div>
          <div class="header-right">
            <img src="${logoUrl}" alt="Logo" class="header-logo" />
            <div class="header-app-name">Mon Assistant Kiné</div>
          </div>
        </div>
        <div class="header-separator"></div>
      `;
    }

    const patientInfoHTML = `
      <div class="patient-info">
        <strong>Patient :</strong> ${DOMPurify.sanitize(savedPatient.firstName)} ${DOMPurify.sanitize(savedPatient.lastName.toUpperCase())}
        &nbsp;&bull;&nbsp; Né(e) le ${patientBirthDate}
      </div>
    `;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Bilan Kinésithérapique - ${DOMPurify.sanitize(savedPatient.firstName)} ${DOMPurify.sanitize(savedPatient.lastName)}</title>
          <style>
            @page { margin: 2cm; size: A4; }
            body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.6; color: #000; max-width: 21cm; margin: 0 auto; padding: 1cm; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5em; }
            .header-left { font-size: 11pt; line-height: 1.4; }
            .header-name { font-weight: bold; font-size: 13pt; }
            .header-right { display: flex; align-items: center; gap: 10px; }
            .header-logo { width: 40px; height: 40px; border-radius: 8px; object-fit: cover; }
            .header-app-name { font-family: Arial, Helvetica, sans-serif; font-size: 12pt; font-weight: bold; color: #3899aa; }
            .header-separator { height: 3px; background: linear-gradient(to right, #4db3c5, #1f5c6a); border: none; border-radius: 2px; margin: 0.6em 0 1.2em 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .patient-info { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; margin-bottom: 1em; padding: 0.5em 0; border-bottom: 1px solid #ccc; }
            .bilan-date { text-align: right; font-size: 10pt; color: #555; font-family: Arial, Helvetica, sans-serif; margin-bottom: -0.5em; }
            h1, h2, h3 { font-weight: bold; margin-top: 1em; margin-bottom: 0.5em; }
            h1 { font-size: 16pt; text-align: center; }
            h2 { font-size: 14pt; }
            h3 { font-size: 12pt; }
            p, li { margin-bottom: 0.5em; text-align: justify; }
            strong { font-weight: bold; }
            u { text-decoration: underline; font-weight: 600; }
            em { font-style: italic; }
            hr { border: none; border-top: 1px solid #000; margin: 1em 0; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          ${headerHTML}
          <div class="bilan-date">Le ${today}</div>
          ${patientInfoHTML}
          ${formattedHTML}
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.focus(); printWindow.print(); }, 250);
  };

  const filteredPatients = patients.filter(p => {
    if (!patientSearch.trim()) return true;
    const search = patientSearch.toLowerCase();
    return p.firstName.toLowerCase().includes(search) || p.lastName.toLowerCase().includes(search);
  });

  const handleBackToNotes = () => {
    setShowBilan(false);
  };

  // Récupère le texte visible du bilan (sans balises HTML)
  const getBilanText = () => {
    if (bilanRef.current) {
      return bilanRef.current.innerText;
    }
    return structuredBilan;
  };

  // Récupère le HTML édité du bilan, sanitizé
  const getBilanHtml = () => {
    if (bilanRef.current) {
      return DOMPurify.sanitize(bilanRef.current.innerHTML);
    }
    return bilanHtml;
  };

  const handleCopyBilan = async () => {
    if (!structuredBilan) return;

    try {
      await navigator.clipboard.writeText(getBilanText());
      toast({
        title: "Copié !",
        description: "Le bilan a été copié dans le presse-papiers",
        variant: "default",
      });
    } catch (error) {
      console.error('Erreur copie:', error);
      toast({
        title: "Erreur",
        description: 'Impossible de copier le bilan',
        variant: "destructive",
      });
    }
  };

  const handleSendEmail = () => {
    if (!structuredBilan) return;

    try {
      const subject = encodeURIComponent('Bilan Kinésithérapique');
      const body = encodeURIComponent(getBilanText());
      const mailto = `mailto:?subject=${subject}&body=${body}`;

      window.location.href = mailto;
    } catch (error) {
      console.error('Erreur ouverture client mail:', error);
      toast({
        title: "Erreur",
        description: 'Erreur lors de l\'ouverture du client mail',
        variant: "destructive",
      });
    }
  };

  const handleDownloadPDF = () => {
    if (!structuredBilan) return;

    try {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        toast({
          title: "Erreur",
          description: 'Veuillez autoriser les fenêtres pop-up pour télécharger le PDF',
          variant: "destructive",
        });
        return;
      }

      const formattedHTML = getBilanHtml();

      // En-tête praticien conditionnel
      const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      const logoUrl = `${window.location.origin}/logo.png`;

      let headerHTML = '';
      if (kineProfile) {
        const name = `${kineProfile.firstName} ${kineProfile.lastName.toUpperCase()}`;
        headerHTML = `
          <div class="header">
            <div class="header-left">
              <div class="header-name">${DOMPurify.sanitize(name)}</div>
              <div>Masseur-Kinésithérapeute D.E.</div>
              ${kineProfile.rpps ? `<div>RPPS : ${DOMPurify.sanitize(kineProfile.rpps)}</div>` : ''}
              ${kineProfile.adresseCabinet ? `<div>${DOMPurify.sanitize(kineProfile.adresseCabinet)}</div>` : ''}
            </div>
            <div class="header-right">
              <img src="${logoUrl}" alt="Logo" class="header-logo" />
              <div class="header-app-name">Mon Assistant Kiné</div>
            </div>
          </div>
          <div class="header-separator"></div>
        `;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Bilan Kinésithérapique</title>
            <style>
              @page {
                margin: 2cm;
                size: A4;
              }
              body {
                font-family: 'Times New Roman', serif;
                font-size: 12pt;
                line-height: 1.6;
                color: #000;
                max-width: 21cm;
                margin: 0 auto;
                padding: 1cm;
              }
              .header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 0.5em;
              }
              .header-left {
                font-size: 11pt;
                line-height: 1.4;
              }
              .header-name {
                font-weight: bold;
                font-size: 13pt;
              }
              .header-right {
                display: flex;
                align-items: center;
                gap: 10px;
              }
              .header-logo {
                width: 40px;
                height: 40px;
                border-radius: 8px;
                object-fit: cover;
              }
              .header-app-name {
                font-family: Arial, Helvetica, sans-serif;
                font-size: 12pt;
                font-weight: bold;
                color: #3899aa;
              }
              .header-separator {
                height: 3px;
                background: linear-gradient(to right, #4db3c5, #1f5c6a);
                border: none;
                border-radius: 2px;
                margin: 0.6em 0 1.2em 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              h1, h2, h3 {
                font-weight: bold;
                margin-top: 1em;
                margin-bottom: 0.5em;
              }
              .bilan-date {
                text-align: right;
                font-size: 10pt;
                color: #555;
                font-family: Arial, Helvetica, sans-serif;
                margin-bottom: -0.5em;
              }
              h1 { font-size: 16pt; text-align: center; }
              h2 { font-size: 14pt; }
              h3 { font-size: 12pt; }
              p, li {
                margin-bottom: 0.5em;
                text-align: justify;
              }
              strong { font-weight: bold; }
              u { text-decoration: underline; font-weight: 600; }
              em { font-style: italic; }
              hr {
                border: none;
                border-top: 1px solid #000;
                margin: 1em 0;
              }
              @media print {
                body { padding: 0; }
              }
            </style>
          </head>
          <body>
            ${headerHTML}
            <div class="bilan-date">Le ${today}</div>
            ${formattedHTML}
          </body>
        </html>
      `);

      printWindow.document.close();

      setTimeout(() => {
        printWindow.focus();
        printWindow.print();
      }, 250);

    } catch (error) {
      console.error('Erreur génération PDF:', error);
      toast({
        title: "Erreur",
        description: 'Erreur lors de la génération du PDF',
        variant: "destructive",
      });
    }
  };

  const placeholderText = `Notez vos observations en vrac...

Ex : patient 52 ans, maçon, lombalgie chronique depuis 3 mois suite port de charge. ATCD : hernie discale L4-L5 opérée 2018. Douleur bas du dos irradiant fesse droite, EVA 5/10 repos 7/10 effort. Flexion lombaire limitée 40°, Lasègue négatif, paravertébraux contracturés...`;

  // Fonction pour convertir le markdown/HTML en HTML sécurisé
  const renderMarkdown = (text: string) => {
    const html = text
      .replace(/═+/g, '<hr class="my-2 border-gray-300" />')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-6 mb-4">$1</h1>')
      .replace(/^- (.*$)/gim, '<li class="ml-4">• $1</li>')
      .replace(/^\d+\. (.*$)/gim, '<li class="ml-4 list-decimal">$1</li>')
      .replace(/\n/g, '<br>');
    return DOMPurify.sanitize(html);
  };

  return (
    <AppLayout>
      {/* Header compact */}
      <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/40">
        <FileText className="text-[#3899aa] h-4 w-4 shrink-0" />
        <h2 className="text-sm font-medium text-[#3899aa]">Bilan Kiné</h2>
        <div className="relative group">
          <div className="flex items-center gap-1.5 bg-[#3899aa]/10 rounded-full px-2.5 py-0.5 cursor-default">
            <Lightbulb className="w-3 h-3 text-[#3899aa]" />
            <span className="text-xs text-foreground font-medium">Conseils</span>
          </div>
          <div className="absolute left-0 top-full mt-2 w-72 bg-popover border border-border rounded-lg shadow-lg p-4 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
            <div className="text-xs text-foreground space-y-3">
              <div>
                <p className="font-medium text-foreground mb-2">Transformez vos notes en bilan structuré :</p>
                <ul className="space-y-1 pl-2">
                  <li>&bull; Notez vos observations sans vous soucier de la structure</li>
                  <li>&bull; Incluez : anamnèse, tests, mesures, observations</li>
                  <li>&bull; Plus vos notes sont détaillées, meilleur sera le bilan</li>
                </ul>
              </div>
              <div>
                <p className="font-medium text-foreground mb-2">Envoi :</p>
                <p className="text-xs">Utilisez votre messagerie cryptée pour transmettre votre bilan au médecin</p>
              </div>
            </div>
          </div>
        </div>
        <Button
          onClick={() => router.push('/dashboard/kine/bilan-kine')}
          disabled={isGenerating}
          size="sm"
          className="h-7 px-3 text-xs btn-teal rounded-full"
        >
          <FilePlus2 className="h-3 w-3 mr-1.5" />
          Nouveau Bilan
        </Button>
      </div>

      {/* Zone centrale unique */}
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full p-4 sm:p-6">

        {/* Bandeau contexte (type + patient ou mode libre) */}
        {!showBilan && (
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${BILAN_TYPE_COLORS[bilanType].bg} ${BILAN_TYPE_COLORS[bilanType].text} border ${BILAN_TYPE_COLORS[bilanType].border}`}>
              Bilan {BILAN_TYPE_LABELS[bilanType]}
            </span>
            {presetPatient ? (
              <span className="text-sm text-foreground">
                · Patient : <strong>{presetPatient.firstName} {presetPatient.lastName.toUpperCase()}</strong>
              </span>
            ) : (
              <span className="text-sm text-muted-foreground italic">· Mode libre (sans patient)</span>
            )}
          </div>
        )}

        {/* Vue Notes */}
        <div className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${showBilan ? 'opacity-0 absolute pointer-events-none' : 'opacity-100'}`}>
          {/* Motif de consultation */}
          <div className="flex items-center gap-2 mb-3 px-1">
            <Search className="h-3.5 w-3.5 text-[#3899aa] shrink-0" />
            <span className="text-xs font-medium text-[#3899aa] shrink-0">Motif</span>
            <Input
              value={motifConsultation}
              onChange={(e) => setMotifConsultation(e.target.value)}
              placeholder="Ex : Lombalgie chronique, rééducation post-opératoire..."
              className="border-0 border-b border-border/60 rounded-none bg-transparent text-sm h-8 px-2 focus-visible:ring-0 focus-visible:border-[#3899aa]/60"
              disabled={isGenerating}
            />
          </div>

          <Textarea
            value={rawNotes}
            onChange={(e) => setRawNotes(e.target.value)}
            placeholder={placeholderText}
            className="min-h-[180px] sm:min-h-[220px] text-sm leading-relaxed text-foreground resize-y rounded-xl border-2 border-border/60 bg-white dark:bg-card p-4 focus-visible:ring-[#3899aa]/50 focus-visible:border-[#3899aa]/60 transition-all"
            disabled={isGenerating}
          />

          {/* Bouton "Comparer avec des bilans antérieurs" — visible si type ≠ INITIAL et patient préselectionné */}
          {presetPatient && bilanType !== 'INITIAL' && (
            <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
              {previousBilans.length > 0 ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap flex-1">
                  <History className="h-3.5 w-3.5 text-[#3899aa] shrink-0" />
                  <span>
                    {previousBilans.length} bilan{previousBilans.length > 1 ? 's' : ''} en comparaison :{' '}
                    {[...previousBilans]
                      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                      .map((b) =>
                        `${BILAN_TYPE_LABELS[b.type]} (${new Date(b.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })})`
                      )
                      .join(' · ')}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCompareModal(true)}
                    className="h-6 px-2 text-xs"
                  >
                    Modifier la sélection
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      // Ouvre le viewer sur le bilan le plus récent ; la navigation
                      // prev/next permet d'accéder aux autres si plusieurs.
                      const mostRecent = [...previousBilans].sort(
                        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                      )[0];
                      setViewingPreviousBilan(mostRecent);
                    }}
                    className="btn-teal h-6 px-3 text-xs rounded-full"
                  >
                    Voir
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCompareModal(true)}
                  className="h-7 text-xs rounded-full"
                >
                  <History className="h-3 w-3 mr-1" />
                  Comparer avec des bilans antérieurs
                </Button>
              )}
            </div>
          )}

          {/* Panneau mesures cliniques */}
          <div className="mt-3">
            <MeasurementsPanel
              structuredData={structuredData}
              onChange={setStructuredData}
              disabled={isGenerating}
            />
          </div>

          <div className="flex flex-col items-end gap-1 mt-3">
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={handleOpenSaveTemplateModal}
                disabled={isGenerating}
                className="rounded-full h-10"
              >
                <Save className="h-4 w-4 mr-2" />
                Sauvegarder le template
              </Button>
              <Button
                onClick={handleGenerateBilan}
                disabled={isGenerating || !rawNotes.trim()}
                className="btn-teal rounded-full px-6 h-10"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Génération en cours...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Générer le bilan
                  </>
                )}
              </Button>
            </div>
            <p className="text-[11px] text-red-400">L&apos;IA peut faire des erreurs. Vérifiez les informations importantes.</p>
          </div>
        </div>

        {/* Vue Bilan */}
        <div className={`flex-1 flex flex-col transition-all duration-300 ease-in-out ${showBilan ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'}`}>
          {/* Barre d'actions */}
          <div className="flex items-center justify-between mb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToNotes}
              className="text-muted-foreground hover:text-foreground h-8 px-3"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Revenir aux notes
            </Button>
            <div className="flex gap-2">
              {presetPatient ? (
                <Button
                  size="sm"
                  onClick={handleSaveDirectly}
                  disabled={isPreviewResult || savingBilan}
                  className="h-8 rounded-full px-4 bg-[#3899aa] hover:bg-[#2d7a88] text-white font-medium shadow-sm"
                >
                  {savingBilan ? (
                    <Loader2 className="h-3.5 w-3.5 sm:mr-1.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5 sm:mr-1.5" />
                  )}
                  <span className="hidden sm:inline">
                    Enregistrer pour {presetPatient.firstName}
                  </span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleOpenPatientModal}
                  disabled={isPreviewResult}
                  className="h-8 rounded-full px-4 bg-[#3899aa] hover:bg-[#2d7a88] text-white font-medium shadow-sm"
                >
                  <UserPlus className="h-3.5 w-3.5 sm:mr-1.5" />
                  <span className="hidden sm:inline">Associer à un patient</span>
                </Button>
              )}
              <Button size="sm" onClick={handleCopyBilan} className="btn-teal h-8 rounded-full px-3">
                <Copy className="h-3 w-3 sm:mr-1.5" />
                <span className="hidden sm:inline">Copier</span>
              </Button>
              <Button size="sm" onClick={handleSendEmail} className="btn-teal h-8 rounded-full px-3">
                <Mail className="h-3 w-3 sm:mr-1.5" />
                <span className="hidden sm:inline">Mail</span>
              </Button>
              <Button size="sm" onClick={handleDownloadPDF} className="btn-teal h-8 rounded-full px-3">
                <Download className="h-3 w-3 sm:mr-1.5" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
            </div>
          </div>

          {/* Bilan contentEditable */}
          <div className="relative flex-1">
            <div
              ref={bilanRef}
              contentEditable={!isPreviewResult}
              suppressContentEditableWarning
              className="min-h-[300px] sm:min-h-[400px] overflow-y-auto text-sm leading-relaxed text-foreground p-4 rounded-xl border-2 border-border/60 bg-white dark:bg-card focus:outline-none focus:border-[#3899aa]/60 transition-all"
              style={isPreviewResult ? {
                maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)'
              } : undefined}
            />
            {isPreviewResult && (
              <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                <Button
                  onClick={() => setIsPaywallOpen(true)}
                  className="btn-teal rounded-full text-sm h-9 px-4 shadow-lg"
                >
                  <Lock className="h-3.5 w-3.5 mr-2" />
                  Débloquer le bilan complet
                </Button>
              </div>
            )}
          </div>

          {!isPreviewResult && (
            <p className="text-[11px] text-muted-foreground mt-2 text-right">
              Vous pouvez modifier le bilan directement avant export
            </p>
          )}
        </div>

      </div>

      {/* Modale sélection patient */}
      <Dialog open={showPatientModal} onOpenChange={setShowPatientModal}>
        <DialogContent className="w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#3899aa]">
              <UserPlus className="w-5 h-5" />
              Associer à un patient
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Rechercher un patient..."
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              className="h-9"
              autoFocus
            />
            {savedPatient ? (
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-center gap-2 text-green-600">
                  <Check className="w-5 h-5" />
                  <span className="font-medium">Bilan associé à {savedPatient.firstName} {savedPatient.lastName.toUpperCase()}</span>
                </div>
                <div className="flex justify-center gap-3">
                  <Button
                    size="sm"
                    onClick={handleDownloadPatientPDF}
                    className="h-9 px-4 bg-[#3899aa] hover:bg-[#2d7a88] text-white rounded-full"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Télécharger le PDF patient
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowPatientModal(false)}
                    className="h-9 px-4 rounded-full"
                  >
                    Fermer
                  </Button>
                </div>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-1">
                {filteredPatients.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Aucun patient trouvé</p>
                ) : (
                  filteredPatients.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleSaveBilanToPatient(p)}
                      disabled={savingBilan}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-[#3899aa]/10 transition-colors text-left disabled:opacity-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-[#3899aa]/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-medium text-[#3899aa]">
                          {p.firstName[0]}{p.lastName[0]}
                        </span>
                      </div>
                      <span className="text-sm font-medium">
                        {p.firstName} {p.lastName.toUpperCase()}
                      </span>
                      {savingBilan && (
                        <Loader2 className="w-4 h-4 animate-spin ml-auto text-[#3899aa]" />
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <PaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        subscription={subscription}
      />

      <TemplateEditorModal
        open={showSaveTemplateModal}
        onOpenChange={setShowSaveTemplateModal}
        mode="private"
        template={null}
        initialItems={saveTemplateInitialItems}
        onSaved={() => {}}
      />

      {presetPatient && (
        <CompareWithPreviousModal
          open={showCompareModal}
          onOpenChange={setShowCompareModal}
          patientId={presetPatient.id}
          initialSelectedIds={previousBilans.map((b) => b.id)}
          onSelect={(bilans) => {
            setPreviousBilans(bilans);
            // Pré-remplit le formulaire avec les mesures du bilan le plus récent
            // parmi ceux sélectionnés. Le kiné peut éditer / vider / supprimer.
            if (bilans.length > 0) {
              const mostRecent = [...bilans].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
              )[0];
              if (mostRecent.structuredData) {
                setStructuredData({
                  measurements: mostRecent.structuredData.measurements.map((m) => ({ ...m })),
                });
              }
            }
          }}
        />
      )}

      <Dialog
        open={viewingPreviousBilan !== null}
        onOpenChange={(o) => !o && setViewingPreviousBilan(null)}
      >
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#3899aa]">
              <FileText className="w-5 h-5" />
              Aperçu du bilan
              {viewingPreviousBilan && previousBilans.length > 1 && (() => {
                const sorted = [...previousBilans].sort(
                  (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
                );
                const idx = sorted.findIndex((b) => b.id === viewingPreviousBilan.id);
                return (
                  <span className="text-xs font-normal text-muted-foreground ml-auto tabular-nums">
                    {idx + 1} / {sorted.length}
                  </span>
                );
              })()}
            </DialogTitle>
          </DialogHeader>

          {viewingPreviousBilan && (
            <BilanDetailView
              bilan={viewingPreviousBilan}
              onBack={() => setViewingPreviousBilan(null)}
              showBackButton={false}
            />
          )}

          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
            {previousBilans.length > 1 && viewingPreviousBilan ? (() => {
              const sorted = [...previousBilans].sort(
                (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
              );
              const idx = sorted.findIndex((b) => b.id === viewingPreviousBilan.id);
              const prev = idx > 0 ? sorted[idx - 1] : null;
              const next = idx < sorted.length - 1 ? sorted[idx + 1] : null;
              return (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => prev && setViewingPreviousBilan(prev)}
                    disabled={!prev}
                    className="rounded-full h-8 text-xs"
                  >
                    <ArrowLeft className="h-3 w-3 mr-1" />
                    Précédent
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => next && setViewingPreviousBilan(next)}
                    disabled={!next}
                    className="rounded-full h-8 text-xs"
                  >
                    Suivant
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              );
            })() : <span />}
            <Button
              variant="outline"
              onClick={() => setViewingPreviousBilan(null)}
              className="rounded-full h-9 text-sm"
            >
              Fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
