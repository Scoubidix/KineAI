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

// Adapte les accords / pronoms selon la civilité d'une personne.
// Fallback masculin générique si civilité absente (convention juridique).
function buildPersonTerms(civilite) {
  const isFem = civilite === 'MME';
  return {
    ne: isFem ? 'Née' : 'Né',
    inscrit: isFem ? 'Inscrite' : 'Inscrit',
    denomme: isFem ? 'dénommée' : 'dénommé',
    ilElle: isFem ? 'Elle' : 'Il',
    ilElleLower: isFem ? 'elle' : 'il',
    sIl: isFem ? 'si elle' : 's\'il',
    lorsquIl: isFem ? 'lorsqu\'elle' : 'lorsqu\'il',
    quIl: isFem ? 'qu\'elle' : 'qu\'il',
    luiMeme: isFem ? 'elle-même' : 'lui-même',
    seul: isFem ? 'seule' : 'seul',
    immatricule: isFem ? 'immatriculée' : 'immatriculé',
    assure: isFem ? 'assurée' : 'assuré',
  };
}

// Termes liés au rôle "remplacé" (s'accordent à la civilité du remplacé).
function buildRemplaceRoleTerms(civilite) {
  const isFem = civilite === 'MME';
  return {
    lower: isFem ? 'la remplacée' : 'le remplacé',
    cap: isFem ? 'La remplacée' : 'Le remplacé',
    du: isFem ? 'de la remplacée' : 'du remplacé',
    au: isFem ? 'à la remplacée' : 'au remplacé',
    confrere: isFem ? 'sa consœur' : 'son confrère',
    ceDernier: isFem ? 'cette dernière' : 'ce dernier',
    // Pronom COD pour "de le/la remplacer" : c'est le remplacé qui se fait remplacer,
    // donc l'accord dépend de sa civilité (et non de celle du remplaçant).
    leLaCod: isFem ? 'la' : 'le',
  };
}

// Termes liés au rôle "remplaçant" (s'accordent à la civilité du remplaçant).
function buildRemplacantRoleTerms(civilite) {
  const isFem = civilite === 'MME';
  return {
    lower: isFem ? 'la remplaçante' : 'le remplaçant',
    cap: isFem ? 'La remplaçante' : 'Le remplaçant',
    du: isFem ? 'de la remplaçante' : 'du remplaçant',
    au: isFem ? 'à la remplaçante' : 'au remplaçant',
    sonSa: isFem ? 'sa remplaçante' : 'son remplaçant', // possessif s'accordant à l'objet possédé
  };
}

// Format "M./MME Prénom NOM" (Nom en majuscules)
function fullName(person) {
  if (!person) return '<span class="placeholder">[...]</span>';
  const civ = person.civilite ? `${esc(person.civilite)} ` : '<span class="placeholder">[Madame ou Monsieur]</span> ';
  const fn = person.firstName ? esc(person.firstName) : '<span class="placeholder">[Prénom]</span>';
  const ln = person.lastName ? esc(person.lastName.toUpperCase()) : '<span class="placeholder">[NOM]</span>';
  return `${civ}${fn} ${ln}`;
}

// Article 6 — phrase indemnités déplacement (toujours présente).
// rRemplace / rRemplacant : role terms genrés (au, du, etc.).
function renderIndemnitesPhrase(percent, rRemplace, rRemplacant) {
  const p = Number(percent);
  if (Number.isNaN(p)) return '<span class="placeholder">[Indemnités de déplacement : pourcentage à définir]</span>';
  if (p === 100) {
    return `Les indemnités de déplacement restent intégralement affectées ${rRemplacant.au}, ainsi que les majorations nuit, dimanche et jours fériés.`;
  }
  if (p === 0) {
    return `Les indemnités de déplacement, ainsi que les majorations nuit, dimanche et jours fériés, restent intégralement affectées ${rRemplace.au}.`;
  }
  return `${p}% des indemnités de déplacement sont affectées ${rRemplacant.au}, le solde ${rRemplace.au}, ainsi que les majorations nuit, dimanche et jours fériés.`;
}

// Article 6 — phrase balnéo (optionnelle : null = article omis).
function renderBalneoPhrase(percent, rRemplace, rRemplacant) {
  if (percent === null || percent === undefined) return '';
  const p = Number(percent);
  if (Number.isNaN(p)) return '';
  if (p === 100) {
    return `<p>Les suppléments de cotation pour balnéothérapie restent intégralement affectés ${rRemplace.au}.</p>`;
  }
  if (p === 0) {
    return `<p>Les suppléments de cotation pour balnéothérapie sont intégralement affectés ${rRemplacant.au}.</p>`;
  }
  return `<p>${p}% des suppléments de cotation pour balnéothérapie sont affectés ${rRemplace.au}, le solde ${rRemplacant.au}.</p>`;
}

function renderRemplacementLiberalHtml(data) {
  const { remplace = {}, remplacant = {}, contrat = {}, signatures = {}, meta = {} } = data;

  const today = meta.todayLabel || new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const logoUrl = meta.logoUrl || '';

  // Termes genrés pré-calculés. `t*` = accords/pronoms personnels d'une personne ;
  // `r*` = termes liés au rôle juridique (s'accordent à la civilité de la personne tenant ce rôle).
  const tRemplace = buildPersonTerms(remplace.civilite);
  const tRemplacant = buildPersonTerms(remplacant.civilite);
  const rRemplace = buildRemplaceRoleTerms(remplace.civilite);
  const rRemplacant = buildRemplacantRoleTerms(remplacant.civilite);

  // Mention "Lu et approuvé" affichée uniquement quand la signature est apposée
  // (mention manuscrite traditionnelle au-dessus de la signature).
  const signRemplace = signatures.remplace
    ? `<div class="signature-approval">Lu et approuvé</div><div class="signature-cursive">${esc(signatures.remplace)}</div>`
    : `<div class="signature-empty">(signature)</div>`;

  const signRemplacant = signatures.remplacant
    ? `<div class="signature-approval">Lu et approuvé</div><div class="signature-cursive">${esc(signatures.remplacant)}</div>`
    : `<div class="signature-empty">(signature)</div>`;

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
  .signature-approval {
    font-size: 10pt;
    font-style: italic;
    color: #333;
    margin-bottom: 0.2em;
  }
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
  <div class="party-line">${tRemplace.ne} le ${esc(remplace.birthDate)} à ${esc(remplace.birthPlace)},</div>
  <div class="party-line">${tRemplace.inscrit} au tableau du Conseil départemental de l'ordre ${formatDepartementOrdre(remplace.departementOrdre)} sous le numéro ${esc(remplace.numeroOrdinal)},</div>
  <div class="party-line">Adresse professionnelle : ${esc(remplace.adresseCabinet)}</div>
  <div class="party-line">Adresse électronique : ${esc(remplace.email)}</div>
  <div class="party-role">Ci-après ${tRemplace.denomme} : « ${rRemplace.lower} »</div>
</div>

<p><strong>ET</strong></p>

<div class="party-block">
  <div class="party-line">${fullName(remplacant)}, masseur-kinésithérapeute,</div>
  <div class="party-line">${tRemplacant.ne} le ${esc(remplacant.birthDate)} à ${esc(remplacant.birthPlace)},</div>
  <div class="party-line">${tRemplacant.inscrit} au tableau du Conseil départemental de l'ordre ${formatDepartementOrdre(remplacant.departementOrdre)} sous le numéro ${esc(remplacant.numeroOrdinal)},</div>
  <div class="party-line">Demeurant ${esc(remplacant.adresseDomicile)}</div>
  <div class="party-line">Adresse électronique : ${esc(remplacant.email)}</div>
  <div class="party-role">Ci-après ${tRemplacant.denomme} : « ${rRemplacant.lower} »</div>
</div>

<p><strong>D'AUTRE PART,</strong></p>

<p>${fullName(remplace)} déclare être dans l'impossibilité temporaire d'exercer son activité. ${tRemplace.ilElle} propose à ${fullName(remplacant)}, masseur-kinésithérapeute, de ${rRemplace.leLaCod} remplacer pendant la durée de son absence.</p>

<p>Conformément à l'article R. 4321-107 alinéa 3 du code de la santé publique, ${fullName(remplace)} s'engage à cesser toute activité de soin pendant la durée du remplacement, sauf accord préalable du conseil départemental de l'ordre.</p>

<p>${fullName(remplace)} s'engage à informer ses patients, dès que possible, de la présence de ${rRemplacant.sonSa}.</p>

<p class="center"><strong>IL A ÉTÉ CONVENU CE QUI SUIT :</strong></p>

<h2>Article 1er — Objet du contrat</h2>
<p>${fullName(remplacant)} (${rRemplacant.lower}) s'engage à exercer temporairement la profession de masseur-kinésithérapeute en lieu et place de ${fullName(remplace)} (${rRemplace.lower}) pendant la durée de son absence.</p>

<h2>Article 2 — Durée du contrat</h2>
<p>Le présent contrat prendra effet le ${esc(contrat.dateDebut)} et se terminera le ${esc(contrat.dateFin)}.</p>

<h2>Article 3 — Respect des règles professionnelles</h2>
<p>Durant la durée du remplacement, ${rRemplacant.lower} s'engage à respecter les dispositions législatives et réglementaires relatives à l'exercice de sa profession et à maintenir son activité dans des limites telles que les patients bénéficient de soins consciencieux, éclairés, attentifs et prudents, conformes aux données acquises de la science. Le cas échéant, ${rRemplacant.lower} s'engage à prendre la situation conventionnelle ${rRemplace.du}.</p>

<h2>Article 4 — Mise à disposition des locaux et installations</h2>
<p>Pour les besoins d'exécution du présent contrat, ${rRemplacant.lower} a l'usage des locaux professionnels, installations et appareils ${rRemplace.du}. ${tRemplacant.ilElle} en fera usage raisonnablement.</p>
<p>${rRemplacant.cap} s'abstient de toute dégradation, comme de toute modification ou changement de destination des lieux sans l'approbation ${rRemplace.du}.</p>
<p>Tous les frais incombant au fonctionnement de l'installation technique de kinésithérapie (réparation, assurance, entretien…) ainsi que les frais afférents aux locaux susmentionnés (loyer, charges, chauffage, eau, électricité, gaz, entretien et réparations…) sont à la charge exclusive ${rRemplace.du}.</p>
<p>${rRemplacant.cap} s'interdit toute utilisation illégale d'internet.</p>
<p>${rRemplacant.cap} assume ses dépenses personnelles (frais de déplacement, d'hébergement et nourriture, assurance maladie, vieillesse…).</p>
<p>Au terme du présent contrat, ${rRemplacant.lower} devra restituer les locaux, le matériel et le mobilier professionnel dans l'état où ${tRemplacant.ilElleLower} les aura trouvés lors du début du remplacement.</p>
<p>Un inventaire, faisant preuve de l'état des lieux et du matériel, peut être contradictoirement dressé et annexé au contrat dès sa signature.</p>

<h2>Article 5 — Indépendance / responsabilité / assurance</h2>
<p>${rRemplacant.cap} exerce son activité en toute indépendance et demeure ${tRemplacant.seul} responsable des actes professionnels ${tRemplacant.quIl} effectue.</p>
<p>${tRemplacant.ilElle} doit à ce titre être ${tRemplacant.assure} en matière de responsabilité civile professionnelle auprès d'une compagnie notoirement solvable. ${tRemplacant.ilElle} doit apporter la preuve de cette assurance avant le début du remplacement.</p>

<h2>Article 6 — Identification ${rRemplacant.du} / perception des honoraires / rétrocession</h2>
<p>${rRemplacant.cap} identifie ses actes dans le logiciel métier utilisé dans le cabinet au moyen de sa carte de professionnel de santé (CPS). Toutefois, ${tRemplacant.sIl} ne dispose pas d'une CPS, ${tRemplacant.ilElleLower} utilise, pour identifier ses actes, les feuilles de soins ${rRemplace.du} après avoir rayé le nom ${rRemplace.du}, en y indiquant son nom ainsi que la mention « remplaçant ».</p>
<p>Les parties conviennent librement des modalités de facturation des actes.</p>
<p>${rRemplacant.cap} reçoit ${tRemplacant.luiMeme} pour le compte ${rRemplace.du} les honoraires correspondant aux actes ${tRemplacant.quIl} a accomplis sur les patients ${rRemplace.du}.</p>
<p>Sur le total des honoraires perçus et facturés pendant le remplacement, ${rRemplace.lower} en reversera <strong>${esc(contrat.retrocessionPercent)}%</strong> ${rRemplacant.au} au titre des soins que ${rRemplacant.lower} a effectivement accomplis. Ce reversement correspond fiscalement à une rétrocession. Le versement du montant total de cette rétrocession devra intervenir au maximum un mois après la fin du remplacement.</p>
<p>${renderIndemnitesPhrase(contrat.indemnitesDeplacementRemplacantPercent, rRemplace, rRemplacant)}</p>
${renderBalneoPhrase(contrat.supplementsBalneoRemplacePercent, rRemplace, rRemplacant)}

<h2>Article 7 — Obligations fiscales et sociales</h2>
<p>${rRemplacant.cap} déclare être ${tRemplacant.immatricule} auprès de l'URSSAF, sauf ${tRemplacant.sIl} dépend d'un régime de sécurité sociale d'un autre État membre de l'Union européenne.</p>
<p>${rRemplace.cap} et ${rRemplacant.lower} acquittent chacun les impôts et charges qui leur incombent dans le cadre du remplacement.</p>
<p>La taxe foncière demeure entièrement à la charge ${rRemplace.du} ${tRemplace.lorsquIl} est propriétaire du local.</p>

<h2>Article 8 — Fin du contrat</h2>
<p>Conformément aux dispositions de l'article R. 4321-108 du code de la santé publique, une fois le remplacement terminé, ${rRemplacant.lower} cessera toute activité s'y rapportant et transmettra, dès la fin du remplacement, toutes informations nécessaires à la continuité des soins ainsi que tous documents administratifs s'y référant.</p>

<h2>Article 9 — Clause de non-installation</h2>
<p>Conformément à l'article R. 4321-130 du code de la santé publique, si au moment où le présent contrat prend fin, ${rRemplacant.lower} a remplacé ${rRemplace.confrere}, pendant au moins trois mois, consécutifs ou non, ${tRemplacant.ilElleLower} ne devra pas, pendant une période de 2 (deux) ans, s'installer dans un cabinet où ${tRemplacant.ilElleLower} puisse entrer en concurrence directe avec ${rRemplace.lower} et avec les masseurs-kinésithérapeutes qui, le cas échéant, exercent avec ${rRemplace.ceDernier}, à moins qu'il n'y ait entre les intéressés un accord qui doit être notifié au conseil départemental.</p>
<p>Par conséquent, ${rRemplacant.lower} s'interdit toute installation, à titre libéral, dans un rayon de <strong>${esc(contrat.nonInstallationRadiusKm)} km</strong> autour du cabinet ${rRemplace.du} ou des associés de ${rRemplace.ceDernier}, tout au long de la période définie à l'alinéa ci-dessus.</p>

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
    <div class="signature-label">${rRemplace.cap}</div>
    ${signRemplace}
  </div>
  <div class="signature-block">
    <div class="signature-label">${rRemplacant.cap}</div>
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
