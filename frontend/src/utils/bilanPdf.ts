import DOMPurify from 'dompurify';

export interface KineProfileForPdf {
  firstName: string;
  lastName: string;
  adresseCabinet?: string;
  rpps?: string;
}

export interface PatientForPdf {
  firstName: string;
  lastName: string;
  birthDate: string;
}

interface GenerateBilanPdfParams {
  bilanHtml: string;
  bilanDateIso?: string; // si non fourni, on prend aujourd'hui
  kineProfile: KineProfileForPdf | null;
  patient?: PatientForPdf;
  logoOrigin?: string; // window.location.origin par défaut
}

/**
 * Génère un PDF de bilan dans une nouvelle fenêtre (window.open + print).
 * Le HTML est sanitizé avec DOMPurify.
 * Lance window.print() automatiquement après injection.
 */
export function generateBilanPdf({
  bilanHtml,
  bilanDateIso,
  kineProfile,
  patient,
  logoOrigin,
}: GenerateBilanPdfParams): { success: boolean; error?: string } {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    return { success: false, error: 'Veuillez autoriser les fenêtres pop-up' };
  }

  const formattedHTML = DOMPurify.sanitize(bilanHtml);
  const dateSource = bilanDateIso ? new Date(bilanDateIso) : new Date();
  const dateStr = dateSource.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const origin = logoOrigin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const logoUrl = `${origin}/logo.png`;

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

  let patientInfoHTML = '';
  if (patient) {
    const patientBirthDate = new Date(patient.birthDate).toLocaleDateString('fr-FR');
    patientInfoHTML = `
      <div class="patient-info">
        <strong>Patient :</strong> ${DOMPurify.sanitize(patient.firstName)} ${DOMPurify.sanitize(patient.lastName.toUpperCase())}
        &nbsp;&bull;&nbsp; Né(e) le ${patientBirthDate}
      </div>
    `;
  }

  const title = patient
    ? `Bilan Kinésithérapique - ${DOMPurify.sanitize(patient.firstName)} ${DOMPurify.sanitize(patient.lastName)}`
    : 'Bilan Kinésithérapique';

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
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
          table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
          th, td { border: 1px solid #999; padding: 4px 8px; text-align: left; }
          th { background: #f0f0f0; font-weight: bold; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${headerHTML}
        <div class="bilan-date">Le ${dateStr}</div>
        ${patientInfoHTML}
        ${formattedHTML}
      </body>
    </html>
  `);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 250);

  return { success: true };
}
