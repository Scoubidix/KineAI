/**
 * Template HTML du contrat de remplacement libéral (CNOMK 28-03-2023).
 *
 * Format inputs (PdfData) :
 * {
 *   remplace: { civilite, firstName, lastName, birthDate, birthPlace, departementOrdre,
 *               numeroOrdinal, adresseCabinet, email },
 *   remplacant: { civilite, firstName, lastName, birthDate, birthPlace, departementOrdre,
 *                 numeroOrdinal, adresseDomicile, email },
 *   contrat: { dateDebut, dateFin, retrocessionPercent, indemnitesDeplacementRemplacantPercent,
 *              supplementsBalneoRemplacePercent | null, nonInstallationRadiusKm,
 *              departementConciliation, signatureLieu, signatureDate },
 *   signatures: { remplace: string|null, remplacant: string|null },  // "Prénom NOM" en cursive
 *   meta: { logoUrl: string, todayLabel: string }
 * }
 */

const DEPARTEMENTS_FR = require('../../data/departements-fr.json');

// Échappe les caractères HTML pour éviter les injections / casser le rendu
function esc(value) {
  if (value === null || value === undefined || value === '') return '<span class="placeholder">[...]</span>';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Formate "Conseil départemental de l'ordre {préposition} {nom}" à partir d'un code
// ("50" → "de la Manche", "01" → "de l'Ain", "28" → "d'Eure-et-Loir", "92" → "des Hauts-de-Seine").
// Fallback : valeur texte libre non reconnue → "de <valeur>".
function formatDepartementOrdre(value) {
  if (value === null || value === undefined || value === '') {
    return '<span class="placeholder">[département de l\'Ordre]</span>';
  }
  const raw = String(value).trim();
  const dep = DEPARTEMENTS_FR[raw] || DEPARTEMENTS_FR[raw.toUpperCase()];
  if (dep) {
    const sep = dep.preposition.endsWith("'") ? '' : ' ';
    return `${dep.preposition}${sep}${esc(dep.name)}`;
  }
  return `de ${esc(raw)}`;
}

// Format "M./MME Prénom NOM" (Nom en majuscules)
function fullName(person) {
  if (!person) return '<span class="placeholder">[...]</span>';
  const civ = person.civilite ? `${esc(person.civilite)} ` : '<span class="placeholder">[Madame ou Monsieur]</span> ';
  const fn = person.firstName ? esc(person.firstName) : '<span class="placeholder">[Prénom]</span>';
  const ln = person.lastName ? esc(person.lastName.toUpperCase()) : '<span class="placeholder">[NOM]</span>';
  return `${civ}${fn} ${ln}`;
}

// Article 6 — phrase indemnités déplacement (toujours présente)
function renderIndemnitesPhrase(percent) {
  const p = Number(percent);
  if (Number.isNaN(p)) return '<span class="placeholder">[Indemnités de déplacement : pourcentage à définir]</span>';
  if (p === 100) {
    return 'Les indemnités de déplacement restent intégralement affectées au remplaçant, ainsi que les majorations nuit, dimanche et jours fériés.';
  }
  if (p === 0) {
    return 'Les indemnités de déplacement, ainsi que les majorations nuit, dimanche et jours fériés, restent intégralement affectées au remplacé.';
  }
  return `${p}% des indemnités de déplacement sont affectées au remplaçant, le solde au remplacé, ainsi que les majorations nuit, dimanche et jours fériés.`;
}

// Article 6 — phrase balnéo (optionnelle : null = article omis)
function renderBalneoPhrase(percent) {
  if (percent === null || percent === undefined) return '';
  const p = Number(percent);
  if (Number.isNaN(p)) return '';
  if (p === 100) {
    return '<p>Les suppléments de cotation pour balnéothérapie restent intégralement affectés au remplacé.</p>';
  }
  if (p === 0) {
    return '<p>Les suppléments de cotation pour balnéothérapie sont intégralement affectés au remplaçant.</p>';
  }
  return `<p>${p}% des suppléments de cotation pour balnéothérapie sont affectés au remplacé, le solde au remplaçant.</p>`;
}

function renderRemplacementLiberalHtml(data) {
  const { remplace = {}, remplacant = {}, contrat = {}, signatures = {}, meta = {} } = data;

  const today = meta.todayLabel || new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const logoUrl = meta.logoUrl || '';

  const signRemplace = signatures.remplace
    ? `<div class="signature-cursive">${esc(signatures.remplace)}</div><div class="signature-mention">Signature précédée de la mention « Lu et approuvé »</div>`
    : `<div class="signature-empty">(signature)</div><div class="signature-mention">Signature précédée de la mention « Lu et approuvé »</div>`;

  const signRemplacant = signatures.remplacant
    ? `<div class="signature-cursive">${esc(signatures.remplacant)}</div><div class="signature-mention">Signature précédée de la mention « Lu et approuvé »</div>`
    : `<div class="signature-empty">(signature)</div><div class="signature-mention">Signature précédée de la mention « Lu et approuvé »</div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Contrat de remplacement (remplaçant libéral)</title>
<style>
  @page { size: A4; margin: 2cm; }
  body {
    font-family: 'Times New Roman', serif;
    font-size: 11pt;
    line-height: 1.5;
    color: #000;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5em;
  }
  .header-left { font-size: 10pt; color: #555; }
  .header-right { display: flex; align-items: center; gap: 8px; }
  .header-logo { width: 36px; height: 36px; border-radius: 6px; object-fit: cover; }
  .header-app-name { font-family: Arial, sans-serif; font-size: 11pt; font-weight: bold; color: #3899aa; }
  .header-separator {
    height: 2px;
    background: linear-gradient(to right, #4db3c5, #1f5c6a);
    border-radius: 2px;
    margin: 0.4em 0 1em 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1 { font-size: 16pt; text-align: center; margin: 0.5em 0 1em 0; }
  h2 { font-size: 12pt; margin-top: 1.2em; margin-bottom: 0.4em; }
  p { margin: 0.4em 0; text-align: justify; }
  .party-block {
    margin: 0.6em 0 0.8em 0;
    padding-left: 1em;
  }
  .party-line { margin: 0.15em 0; }
  .party-role { font-weight: bold; margin-top: 0.4em; }
  .center { text-align: center; }
  .placeholder { color: #b85c00; font-style: italic; }
  .signatures-row {
    display: flex;
    justify-content: space-between;
    gap: 2em;
    margin-top: 2em;
    page-break-inside: avoid;
  }
  .signature-block { flex: 1; text-align: center; }
  .signature-label { font-weight: bold; margin-bottom: 0.5em; }
  .signature-cursive {
    font-family: 'Brush Script MT', 'Lucida Handwriting', cursive;
    font-size: 22pt;
    min-height: 50px;
    border-bottom: 1px solid #000;
    padding: 0.5em 0;
  }
  .signature-empty {
    color: #aaa;
    min-height: 50px;
    border-bottom: 1px solid #000;
    padding: 1.2em 0 0.2em 0;
    font-style: italic;
  }
  .signature-mention { font-size: 9pt; color: #555; margin-top: 0.3em; }
  .legal-warning {
    margin-top: 1.5em;
    padding: 0.6em 0.8em;
    border: 1px solid #d0a060;
    background: #fff8ec;
    border-radius: 4px;
    font-size: 9pt;
    color: #5a3a10;
    text-align: justify;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    page-break-inside: avoid;
  }
  .footer-note {
    margin-top: 1.5em;
    font-size: 8pt;
    color: #888;
    text-align: center;
    border-top: 1px solid #ddd;
    padding-top: 0.4em;
  }
</style>
</head>
<body>

<div class="header">
  <div class="header-left">Édité le ${esc(today)}</div>
  <div class="header-right">
    ${logoUrl ? `<img src="${esc(logoUrl)}" alt="Logo" class="header-logo" />` : ''}
    <div class="header-app-name">Mon Assistant Kiné</div>
  </div>
</div>
<div class="header-separator"></div>

<h1>Contrat de remplacement libéral</h1>

<p><strong>ENTRE :</strong></p>

<div class="party-block">
  <div class="party-line">${fullName(remplace)}, masseur-kinésithérapeute,</div>
  <div class="party-line">Né(e) le ${esc(remplace.birthDate)} à ${esc(remplace.birthPlace)},</div>
  <div class="party-line">Inscrit(e) au tableau du Conseil départemental de l'ordre ${formatDepartementOrdre(remplace.departementOrdre)} sous le numéro ${esc(remplace.numeroOrdinal)},</div>
  <div class="party-line">Adresse professionnelle : ${esc(remplace.adresseCabinet)}</div>
  <div class="party-line">Adresse électronique : ${esc(remplace.email)}</div>
  <div class="party-role">Ci-après dénommé : « le remplacé »</div>
</div>

<p><strong>ET</strong></p>

<div class="party-block">
  <div class="party-line">${fullName(remplacant)}, masseur-kinésithérapeute,</div>
  <div class="party-line">Né(e) le ${esc(remplacant.birthDate)} à ${esc(remplacant.birthPlace)},</div>
  <div class="party-line">Inscrit(e) au tableau du Conseil départemental de l'ordre ${formatDepartementOrdre(remplacant.departementOrdre)} sous le numéro ${esc(remplacant.numeroOrdinal)},</div>
  <div class="party-line">Demeurant ${esc(remplacant.adresseDomicile)}</div>
  <div class="party-line">Adresse électronique : ${esc(remplacant.email)}</div>
  <div class="party-role">Ci-après dénommé : « le remplaçant »</div>
</div>

<p><strong>D'AUTRE PART,</strong></p>

<p>${fullName(remplace)} déclare être dans l'impossibilité temporaire d'exercer son activité. Il/Elle propose à ${fullName(remplacant)}, masseur-kinésithérapeute, de le/la remplacer pendant la durée de son absence.</p>

<p>Conformément à l'article R. 4321-107 alinéa 3 du code de la santé publique, ${fullName(remplace)} s'engage à cesser toute activité de soin pendant la durée du remplacement, sauf accord préalable du conseil départemental de l'ordre.</p>

<p>${fullName(remplace)} s'engage à informer ses patients, dès que possible, de la présence de son remplaçant.</p>

<p class="center"><strong>IL A ÉTÉ CONVENU CE QUI SUIT :</strong></p>

<h2>Article 1er — Objet du contrat</h2>
<p>${fullName(remplacant)} (le remplaçant) s'engage à exercer temporairement la profession de masseur-kinésithérapeute en lieu et place de ${fullName(remplace)} (le remplacé) pendant la durée de son absence.</p>

<h2>Article 2 — Durée du contrat</h2>
<p>Le présent contrat prendra effet le ${esc(contrat.dateDebut)} et se terminera le ${esc(contrat.dateFin)}.</p>

<h2>Article 3 — Respect des règles professionnelles</h2>
<p>Durant la durée du remplacement, le remplaçant s'engage à respecter les dispositions législatives et réglementaires relatives à l'exercice de sa profession et à maintenir son activité dans des limites telles que les patients bénéficient de soins consciencieux, éclairés, attentifs et prudents, conformes aux données acquises de la science. Le cas échéant, le remplaçant s'engage à prendre la situation conventionnelle du remplacé.</p>

<h2>Article 4 — Mise à disposition des locaux et installations</h2>
<p>Pour les besoins d'exécution du présent contrat, le remplaçant a l'usage des locaux professionnels, installations et appareils du remplacé. Il en fera usage raisonnablement.</p>
<p>Le remplaçant s'abstient de toute dégradation, comme de toute modification ou changement de destination des lieux sans l'approbation du remplacé.</p>
<p>Tous les frais incombant au fonctionnement de l'installation technique de kinésithérapie (réparation, assurance, entretien…) ainsi que les frais afférents aux locaux susmentionnés (loyer, charges, chauffage, eau, électricité, gaz, entretien et réparations…) sont à la charge exclusive du remplacé.</p>
<p>Le remplaçant s'interdit toute utilisation illégale d'internet.</p>
<p>Le remplaçant assume ses dépenses personnelles (frais de déplacement, d'hébergement et nourriture, assurance maladie, vieillesse…).</p>
<p>Au terme du présent contrat, le remplaçant devra restituer les locaux, le matériel et le mobilier professionnel dans l'état où il les aura trouvés lors du début du remplacement.</p>
<p>Un inventaire, faisant preuve de l'état des lieux et du matériel, peut être contradictoirement dressé et annexé au contrat dès sa signature.</p>

<h2>Article 5 — Indépendance / responsabilité / assurance</h2>
<p>Le remplaçant exerce son activité en toute indépendance et demeure seul responsable des actes professionnels qu'il effectue.</p>
<p>Il doit à ce titre être assuré en matière de responsabilité civile professionnelle auprès d'une compagnie notoirement solvable. Il doit apporter la preuve de cette assurance avant le début du remplacement.</p>

<h2>Article 6 — Identification du remplaçant / perception des honoraires / rétrocession</h2>
<p>Le remplaçant identifie ses actes dans le logiciel métier utilisé dans le cabinet au moyen de sa carte de professionnel de santé (CPS). Toutefois, si le remplaçant ne dispose pas d'une CPS, il utilise, pour identifier ses actes, les feuilles de soins du remplacé après avoir rayé le nom du remplacé, en y indiquant son nom ainsi que la mention « remplaçant ».</p>
<p>Les parties conviennent librement des modalités de facturation des actes.</p>
<p>Le remplaçant reçoit lui-même pour le compte du remplacé les honoraires correspondant aux actes qu'il a accomplis sur les patients du remplacé.</p>
<p>Sur le total des honoraires perçus et facturés pendant le remplacement, le remplacé en reversera <strong>${esc(contrat.retrocessionPercent)}%</strong> au remplaçant au titre des soins que le remplaçant a effectivement accomplis. Ce reversement correspond fiscalement à une rétrocession. Le versement du montant total de cette rétrocession devra intervenir au maximum un mois après la fin du remplacement.</p>
<p>${renderIndemnitesPhrase(contrat.indemnitesDeplacementRemplacantPercent)}</p>
${renderBalneoPhrase(contrat.supplementsBalneoRemplacePercent)}

<h2>Article 7 — Obligations fiscales et sociales</h2>
<p>Le remplaçant déclare être immatriculé auprès de l'URSSAF, sauf s'il dépend d'un régime de sécurité sociale d'un autre État membre de l'Union européenne.</p>
<p>Le remplacé et le remplaçant acquittent chacun les impôts et charges qui leur incombent dans le cadre du remplacement.</p>
<p>La taxe foncière demeure entièrement à la charge du remplacé lorsqu'il est propriétaire du local.</p>

<h2>Article 8 — Fin du contrat</h2>
<p>Conformément aux dispositions de l'article R. 4321-108 du code de la santé publique, une fois le remplacement terminé, le remplaçant cessera toute activité s'y rapportant et transmettra, dès la fin du remplacement, toutes informations nécessaires à la continuité des soins ainsi que tous documents administratifs s'y référant.</p>

<h2>Article 9 — Clause de non-installation</h2>
<p>Conformément à l'article R. 4321-130 du code de la santé publique, si au moment où le présent contrat prend fin, le remplaçant a remplacé son confrère, pendant au moins trois mois, consécutifs ou non, il ne devra pas, pendant une période de 2 (deux) ans, s'installer dans un cabinet où il puisse entrer en concurrence directe avec le remplacé et avec les masseurs-kinésithérapeutes qui, le cas échéant, exercent avec ce dernier, à moins qu'il n'y ait entre les intéressés un accord qui doit être notifié au conseil départemental.</p>
<p>Par conséquent, le remplaçant s'interdit toute installation, à titre libéral, dans un rayon de <strong>${esc(contrat.nonInstallationRadiusKm)} km</strong> autour du cabinet du remplacé ou des associés de ce dernier, tout au long de la période définie à l'alinéa ci-dessus.</p>

<h2>Article 10 — Conciliation</h2>
<p>En cas de difficultés soulevées par l'application ou l'interprétation du présent acte, les parties s'engagent, conformément à l'article R. 4321-99 alinéa 2 du code de la santé publique, préalablement à toute action contentieuse, à soumettre leur différend à une tentative de conciliation confiée au besoin au conseil départemental de l'ordre des masseurs-kinésithérapeutes ${formatDepartementOrdre(contrat.departementConciliation)}.</p>
<p>La procédure de conciliation ici présentée en application de l'article R. 4321-99 alinéa 2 du code de la santé publique se distingue de la conciliation préalable à l'action disciplinaire sur dépôt de plainte.</p>

<h2>Article 11 — Contentieux</h2>
<p>En cas d'échec de la conciliation, les litiges ou différends relatifs à la validité, l'interprétation, l'exécution du présent contrat, peuvent être soumis à la juridiction compétente.</p>

<h2>Article 12 — Absence de contre-lettre</h2>
<p>Les cocontractants certifient sur l'honneur qu'il n'existe aucune contre-lettre au présent contrat.</p>

<h2>Article 13 — Communication à l'Ordre</h2>
<p>Conformément aux articles L. 4113-9, R. 4321-107, R. 4321-127 et R. 4321-134 du code de la santé publique, le présent contrat ainsi que tout avenant sera communiqué par chaque partie au conseil départemental de l'ordre des masseurs-kinésithérapeutes dont elle relève. Son renouvellement sera soumis à ces mêmes dispositions.</p>

<p style="margin-top: 1.5em;">Fait le ${esc(contrat.signatureDate)} à ${esc(contrat.signatureLieu)}, en deux exemplaires.</p>

<div class="signatures-row">
  <div class="signature-block">
    <div class="signature-label">Le remplacé</div>
    ${signRemplace}
  </div>
  <div class="signature-block">
    <div class="signature-label">Le remplaçant</div>
    ${signRemplacant}
  </div>
</div>

<div class="legal-warning">
  <strong>Avertissement légal —</strong> En signant ce contrat, chaque partie certifie sur l'honneur être la personne nommée et signer en son nom propre. Toute fausse déclaration ou signature falsifiée constitue un faux en écriture sanctionné par l'article 441-1 du Code pénal (3 ans d'emprisonnement et 45 000 € d'amende).
</div>

<div class="footer-note">
  Document généré par Mon Assistant Kiné — non opposable à l'Ordre tant que les deux signatures ne sont pas apposées.
</div>

</body>
</html>`;
}

module.exports = { renderRemplacementLiberalHtml };
