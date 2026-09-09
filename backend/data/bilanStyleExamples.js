// Exemples de STYLE pour la rédaction IA du bilan (spec §6.2). Validés par l'utilisateur le 9 sept. 2026,
// dans le registre du bilan diagnostique kinésithérapique (fiche de synthèse NGAP, cours IFMK).
// Le modèle doit en imiter la forme (longueur, ton, raisonnement), jamais en reprendre le contenu :
// ils sont volontairement pauvres en chiffres pour ne rien injecter dans un bilan réel.

const STYLE_PRINCIPLES = [
  'Troisième personne, présent, phrases complètes, jamais de liste.',
  'Court : deux à quatre phrases par section, une seule quand les notes sont pauvres.',
  'N\'écris que ce qui a été recueilli. Une absence n\'est mentionnée que si elle pèse dans le raisonnement (un test négatif qui écarte une hypothèse), jamais pour remplir.',
  'L\'examen clinique interprète et relie les signes ; les tests sont nommés dans le raisonnement, leurs valeurs restent dans le tableau.',
  'Le diagnostic kinésithérapique est une hypothèse (« évoque », « compatible avec », « oriente vers »), jamais une affirmation ; il dégage deux ou trois dominantes.',
  'Objectifs à court, moyen et long terme, en termes de fonction ; traitement avec rythme, phases, techniques et conseils : seulement à partir de ce que les notes contiennent, jamais un plan inventé.',
];

const STYLE_EXAMPLES = [
  {
    title: 'Lombalgie commune subaiguë, bilan initial',
    sections: {
      anamnese: 'M. D., 52 ans, maçon, consulte pour une lombalgie basse évoluant depuis trois mois, apparue progressivement lors d\'une période de port de charges répété, sans traumatisme. La douleur, en barre lombaire avec irradiation intermittente vers la fesse droite, est de rythme mécanique, majorée par la station assise prolongée et les transitions assis-debout. En arrêt de travail depuis trois semaines, il exprime une appréhension marquée de la flexion et souhaite reprendre son poste.',
      antecedents: 'Hernie discale L4-L5 opérée en 2018. Antalgiques de palier 1 à la demande.',
      examen: 'Attitude en délordose avec raideur des transitions. La mobilité lombaire est limitée et douloureuse en fin de flexion, la palpation retrouve une contracture des paravertébraux droits et une douleur à la pression de l\'étage L4-L5. L\'examen neurodynamique est rassurant : Lasègue négatif des deux côtés et sonnette absente, ce qui plaide contre une irritation radiculaire active malgré l\'irradiation fessière. L\'endurance des extenseurs du tronc et le contrôle de la flexion, avec une dissociation hanches-rachis difficile, sont nettement en deçà de l\'attendu pour un travailleur de force.',
      limitations: 'Station assise limitée à une trentaine de minutes, port de charges évité, position penchée en avant non tenue. Arrêt de travail en cours et pratique du vélo suspendue par crainte de la douleur.',
      diagnostic: 'Le tableau évoque une lombalgie commune subaiguë à prédominance mécanique, sans argument pour une irritation radiculaire. Les dominantes retenues sont la limitation douloureuse de la flexion, la contracture paravertébrale droite et le déficit d\'endurance et de contrôle moteur du tronc, auxquelles s\'ajoute une kinésiophobie susceptible d\'entretenir le tableau. Le pronostic paraît favorable sous réserve d\'une remise en mouvement précoce.',
      objectifs: 'À court terme, diminuer la douleur et l\'appréhension du mouvement, retrouver une flexion indolore. À moyen terme, rétablir l\'endurance et le contrôle du tronc, tolérer une heure de station assise et le port de charges modérées. À long terme, reprendre le poste de maçon avec des stratégies de port sécurisées, reprendre le vélo, et poursuivre un programme d\'entretien en autonomie.',
      traitement: 'Deux séances hebdomadaires pendant six semaines, réévaluées à mi-parcours. Une première phase associe éducation au mouvement, techniques manuelles antalgiques lombaires et de hanches, et mobilité en flexion progressive. Une seconde phase cible l\'endurance des extenseurs, le gainage et la dissociation hanches-rachis, avant le réentraînement aux gestes du métier et la reprise graduée du vélo. Conseils : rester actif, fractionner la station assise, marcher chaque jour, exercices quotidiens à domicile.',
    },
  },
  {
    title: 'Ligamentoplastie du genou droit (DIDT), bilan intermédiaire à six semaines',
    sections: {
      anamnese: 'Mme L., 29 ans, assistante maternelle, est revue à six semaines d\'une ligamentoplastie du ligament croisé antérieur du genou droit par DIDT, après une rupture au football amateur avec dérobements. Le protocole du chirurgien autorise l\'appui complet et limite la flexion forcée jusqu\'à la sixième semaine. La douleur est modérée, surtout en fin de journée et à la descente des escaliers. Reprise du travail la semaine prochaine, souhait de retour au football.',
      antecedents: 'Entorse de la cheville droite à l\'adolescence, sans séquelle.',
      examen: 'Discret épanchement intra-articulaire, cicatrice propre et souple. La flexion progresse conformément au délai mais bute en fin de course, et un flessum persiste en extension passive, point d\'attention prioritaire à ce stade. Le quadriceps reste nettement hypotrophié par rapport au côté sain, avec un verrouillage en charge encore insuffisant, ce qui explique la boiterie discrète observée à la marche et la descente marche par marche des escaliers. Les tests de stabilité ligamentaire ne sont pas réalisés à ce stade, conformément aux consignes du chirurgien.',
      limitations: 'Marche possible sans aide sur terrain plat, mais escaliers, position accroupie et relevé du sol restent difficiles, ce qui gêne les gestes auprès de jeunes enfants. Aucune activité sportive reprise.',
      diagnostic: 'L\'évolution paraît conforme au délai post-opératoire. Deux dominantes se dégagent : un déficit d\'extension avec flessum résiduel, et une amyotrophie du quadriceps compatible avec le défaut de verrouillage en charge, qui ensemble rendent compte de la boiterie et des difficultés dans les escaliers et les positions basses. Le pronostic semble favorable, la récupération de l\'extension complète conditionnant la qualité de la marche et la suite du renforcement.',
      objectifs: 'À court terme, obtenir l\'extension complète, résorber l\'épanchement et restaurer un verrouillage actif en charge. À moyen terme, récupérer une flexion fonctionnelle, symétriser la force du quadriceps, normaliser marche et escaliers. À long terme, restaurer proprioception et puissance en vue de la course puis des changements de direction, pour une reprise du football encadrée selon les critères de retour au sport.',
      traitement: 'Trois séances hebdomadaires. Priorité au gain d\'extension par postures, mobilisations spécifiques et travail actif du quadriceps en fin de course, avec drainage de l\'épanchement. Renforcement du quadriceps en chaîne fermée puis ouverte selon le protocole, proprioception en appui bipodal puis unipodal, rééducation de la marche et des escaliers. Reprise de la course envisagée une fois l\'extension complète, la marche symétrique et la force suffisante. Conseils : glaçage après les séances, exercices quotidiens d\'extension et de verrouillage, pas de position accroupie forcée ni de pivot avant l\'accord du chirurgien.',
    },
  },
];

module.exports = { STYLE_PRINCIPLES, STYLE_EXAMPLES };
