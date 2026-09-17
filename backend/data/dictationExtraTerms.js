// Termes hors catalogue que la dictée écorche souvent : chirurgiens et techniques, matériel, sigles,
// éponymes, noms anglais de tests, anatomie et pathologie savantes.
//
// Le vocabulaire envoyé au correcteur prend UN terme par champ du catalogue (le premier alias,
// le plus court et le plus prononçable). Les autres alias servent à l'extraction, pas à la
// correction — sauf ceux listés ici, qui sont à risque de mauvaise transcription et que ce
// premier terme ne couvre pas.
//
// Liste versionnée et relue à la main. Ce qui remonte du terrain passe par la table
// dictation_terms et l'onglet admin « Dictée », pas par ce fichier.
const EXTRA_TERMS = [
  '6 minutes', '6mwt', 'abd épaule', 'abducteurs d\'épaule', 'abducteurs de hanche', 'accroupissement',
  'acromio-claviculaire', 'active compression', 'add épaule', 'anesthésie', 'antépulsion', 'appréhension rotulienne',
  'apprehension test', 'atcd', 'atcds', 'attelle', 'attentes', 'Bankart',
  'béquilles', 'Bobath', 'Brostrom', 'canal carpien', 'canne anglaise', 'cannes',
  'ccft', 'ceinture lombaire', 'cheville en 8', 'chevillère', 'cicatrice adhérente', 'circonférence sus-rotulienne',
  'Codman', 'Compex', 'cotation quadriceps', 'crépitation', 'cross arm', 'Cyriax',
  'dash', 'dds', 'de quervain', 'déambulateur', 'déficit moteur', 'dermatome',
  'déviation radiale', 'déviation ulnaire', 'DIDT', 'dorsiflexion', 'dorsiflexion hallux', 'douleur interligne',
  'DT4', 'Dujarrier', 'échographie', 'empty can', 'engourdissements', 'épanchement',
  'épicondylite', 'épitrochlée', 'épitrochléite', 'équilibre unipodal', 'érythème', 'état cicatriciel',
  'état cutané', 'eva au repos', 'eva nocturne', 'éverseurs', 'éversion cheville', 'extenseurs de hanche',
  'extenseurs du coude', 'fascia plantaire', 'fd cheville', 'fémoral', 'figure en 8', 'figure of eight',
  'fléchisseurs de hanche', 'fléchisseurs du coude', 'flessum', 'force deltoïde', 'force ischio', 'force ischios',
  'force quadriceps', 'fourmillements', 'fp cheville', 'gainage ventral', 'gastrocnémiens', 'genouillère',
  'golfer elbow', 'grand glutéal', 'grind pouce', 'grinding test', 'grip', 'gros orteil',
  'hawkins kennedy', 'heel rise', 'hop test', 'hypoesthésie', 'ij dynamomètre', 'ilio-psoas',
  'inclinaison latérale droite', 'inclinaison latérale gauche', 'incontinence', 'indice de schober', 'infra-épineux', 'inversion cheville',
  'irm', 'irradiant', 'irradie', 'ischio-jambiers dynamo', 'ischios', 'jamar',
  'jambier antérieur', 'jerk test', 'jeu rotulien', 'Judet', 'K-Taping', 'Kabat',
  'Kapandji', 'Kenneth-Jones', 'Klapp', 'koos', 'ktw', 'lasègue inversé',
  'Latarjet', 'latéroflexion cervicale droite', 'latéroflexion cervicale gauche', 'lateroflexion droite', 'lateroflexion gauche', 'laxité antérieure',
  'lift off', 'ligament collatéral latéral', 'ligament collatéral médial', 'ligament latéral externe', 'lle genou', 'load & shift',
  'lta', 'luc', 'lunge test', 'mac murray', 'MacIntosh', 'Maitland',
  'marche boiteuse', 'McKenzie', 'médicaments', 'Mézières', 'mobilite rotule', 'mollet unipodal',
  'moyen fessier résisté', 'moyen glutéal', 'Mulligan', 'Mumford', 'Neer', 'neurodynamique médian',
  'neuropathique', 'orthèse', 'oswestry', 'palm up', 'palpation achille', 'palpation interligne',
  'palpation pubienne', 'palpation trochanter', 'patrick', 'Perfetti', 'péroniers', 'pèse',
  'peur de tomber', 'Pilates', 'pivot shift', 'planche', 'pouce du skieur', 'pronation avant-bras',
  'protocole chirurgical', 'protocole post-op', 'provocation si', 'pubalgie', 'quad dynamomètre', 'questionnaire',
  'radio', 'radiographie', 're hanche', 're1', 'red flags', 'réflexe achilléen',
  'réflexe rotulien', 'réflexes', 'releveur du pied', 'releveurs', 'relocation', 'relocation test',
  'ressaut rotatoire', 'rétropulsion', 'rhizarthrose', 'ri hanche', 'ri main dos', 'rotation cervicale dt',
  'rotation cervicale gche', 'rupture achille', 'Sauvé-Kapandji', 'scanner', 'scapho-lunaire', 'scaphoïde',
  'Schroth', 'score dn4', 'signe de tinel', 'signe du godet', 'signe du rabot', 'signe du sillon',
  'signes d’alerte', 'single hop', 'slr', 'slump test', 'smilie', 'Sohier',
  'soléaire', 'sørensen', 'sphincters', 'squeeze test adducteurs', 'straight leg raise', 'subscapulaire',
  'supination avant-bras', 'supra épineux', 'syndesmose', 'talar tilt', 'talo-fibulaire', 'tendon d’achille',
  'TENS', 'test de mill', 'test de neer', 'test de patrick', 'test de patte', 'test de thomas',
  'test de thompson', 'tfl', 'tiroir cheville', 'treuil', 'troubles trophiques', 'ttt',
  'valgus stress', 'varus forcé cheville', 'varus stress', 'womac', 'Zimmer',
];

module.exports = { EXTRA_TERMS };
