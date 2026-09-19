// Exemples de STYLE pour la rédaction IA du bilan (spec §6.2). Validés par l'utilisateur le 9 sept. 2026,
// dans le registre du bilan diagnostique kinésithérapique (fiche de synthèse NGAP, cours IFMK).
// Le modèle doit en imiter la forme (longueur, ton, raisonnement), jamais en reprendre le contenu :
// ils sont volontairement pauvres en chiffres pour ne rien injecter dans un bilan réel.

const STYLE_PRINCIPLES = [
  'Troisième personne, présent, phrases complètes, jamais de liste — sauf les antécédents, qui restent en forme brève.',
  'Court : deux à quatre phrases par section, une seule quand les notes sont pauvres.',
  'N\'écris que ce qui a été recueilli. Une absence n\'est mentionnée que si elle pèse dans le raisonnement (un test négatif qui écarte une hypothèse), jamais pour remplir.',
  'L\'examen clinique rapporte les constats ; une seule phrase relie les signes entre eux. Les tests sont nommés dans le raisonnement, leurs valeurs restent dans le tableau.',
  'Le diagnostic kinésithérapique est une hypothèse (« évoque », « compatible avec », « oriente vers »), jamais une affirmation ; il relie les déficiences aux limitations d\'activité et aux restrictions de participation, et se termine par un pronostic fonctionnel prudent.',
  'Objectifs à court, moyen et long terme, en termes de fonction ; traitement bref : rythme, visée de chaque phase et conseils, sans détailler les techniques — seulement à partir de ce que les notes contiennent, jamais un plan inventé.',
];

const STYLE_EXAMPLES = {
  INITIAL: [
    {
      title: 'Lombalgie commune subaiguë, bilan initial',
      sections: {
        anamnese: '[Prénom] [NOM], [âge] ans, maçon, consulte pour une lombalgie basse évoluant depuis trois mois, apparue progressivement lors d\'une période de port de charges répété, sans traumatisme. La douleur est de rythme mécanique, majorée par la station assise prolongée et les transferts assis-debout. En arrêt de travail depuis trois semaines, il exprime une appréhension marquée de la flexion et souhaite reprendre son poste.',
        antecedents: 'Hernie discale L4-L5 opérée en 2018. Antalgiques de palier 1 à la demande.',
        examen: 'L\'attitude est en délordose et les transferts sont difficiles, avec une mobilité lombaire limitée et douloureuse en fin de flexion. La palpation retrouve une contracture des paravertébraux droits et une douleur à la pression de L4-L5 ; l\'irradiation fessière droite n\'est pas systématisée. Le Lasègue est négatif des deux côtés et la sonnette est absente, sans argument pour une atteinte radiculaire. L\'endurance des extenseurs du tronc et le contrôle de la flexion sont insuffisants, et la dissociation hanches-rachis reste difficile.',
        limitations: 'Le patient ne tient la station assise qu\'une trentaine de minutes, évite le port de charges et ne supporte pas la position penchée en avant. En arrêt de travail, il ne pratique plus le vélo par crainte de la douleur.',
        diagnostic: 'Le tableau évoque une lombalgie commune subaiguë, sans atteinte radiculaire. Le déficit d\'endurance et de contrôle moteur du tronc, associé à la contracture paravertébrale droite, limite la flexion et la tenue de la station assise. Ces limitations empêchent le port de charges et l\'exercice du métier de maçon. La reprise du travail paraît accessible, à condition de lever l\'appréhension du mouvement et de restaurer l\'endurance du tronc.',
        objectifs: 'À court terme, la rééducation vise à diminuer la douleur et l\'appréhension du mouvement pour retrouver une flexion indolore. À moyen terme, elle doit rétablir l\'endurance et le contrôle du tronc, allonger le temps de station assise toléré et permettre le port de charges modérées. Les objectifs à long terme sont la reprise du travail, le retour au vélo et la poursuite d\'un programme d\'entretien en autonomie.',
        traitement: 'Le traitement comprend deux séances hebdomadaires pendant six semaines, réévaluées à mi-parcours. Il vise d\'abord la diminution de la douleur et la mobilité en flexion, puis l\'endurance et le contrôle du tronc, avant le réentraînement aux gestes du métier. Le patient est encouragé à rester actif et à poursuivre ses exercices à domicile.',
      },
    },
  ],
  INTERMEDIAIRE: [
    {
      title: 'Ligamentoplastie du genou droit (DIDT), bilan intermédiaire à six semaines',
      sections: {
        anamnese: '[Prénom] [NOM], [âge] ans, est revue à six semaines d\'une ligamentoplastie du ligament croisé antérieur du genou droit par DIDT.',
        antecedents: 'Entorse de la cheville droite à l\'adolescence, sans séquelle.',
        examen: 'L\'épanchement intra-articulaire est discret et la cicatrice est propre et souple. La flexion progresse conformément au délai mais bute en fin de course, et un flessum persiste en extension passive. Le quadriceps est encore hypotrophié par rapport au côté sain, le verrouillage en charge est insuffisant et la boiterie reste présente. Les tests de stabilité ligamentaire ne sont pas réalisés à ce stade, conformément aux consignes du chirurgien.',
        limitations: 'La patiente marche sans aide sur terrain plat, mais les escaliers, la position accroupie et le relevé du sol restent difficiles, ce qui la gêne dans les gestes de son métier auprès de jeunes enfants. Elle n\'a repris aucune activité sportive.',
        diagnostic: 'L\'évolution paraît conforme au délai post-opératoire : la flexion progresse. Le flessum résiduel et l\'amyotrophie du quadriceps sont ce qui pèse le plus aujourd\'hui ; ils expliquent la boiterie et les difficultés dans les escaliers. Ces difficultés gênent encore les gestes du métier et retardent la reprise sportive. Le pronostic fonctionnel dépend surtout de la récupération de l\'extension complète, qui conditionne la marche et la suite du renforcement.',
        objectifs: 'Les objectifs du bilan précédent sont partiellement atteints : l\'appui complet est acquis et l\'épanchement a régressé, mais l\'extension complète et le verrouillage actif en charge restent à obtenir à court terme. À moyen terme, il s\'agit de récupérer une flexion fonctionnelle, de symétriser la force du quadriceps et de normaliser la marche et les escaliers, tout en accompagnant la reprise du travail. À long terme, le travail de proprioception et la réathlétisation doivent permettre la reprise des activités sportives normales.',
        traitement: 'Le traitement comprend trois séances hebdomadaires. Il vise d\'abord le gain d\'amplitude et le drainage de l\'épanchement, puis le renforcement musculaire et la proprioception. La patiente glace après les séances, poursuit ses exercices quotidiens et évite l\'accroupissement forcé et les pivots jusqu\'à l\'accord du chirurgien.',
      },
    },
  ],
  FINAL: [
    {
      title: 'Conflit sous-acromial de l\'épaule droite, bilan de fin de prise en charge',
      sections: {
        anamnese: '[Prénom] [NOM], [âge] ans, termine une prise en charge engagée il y a quatre mois pour une épaule droite douloureuse.',
        antecedents: 'Tendinopathie de la coiffe traitée médicalement en 2022, sans rééducation. Aucun traitement antalgique en cours.',
        examen: 'L\'épaule est indolore, y compris la nuit. Les amplitudes actives sont symétriques et la coiffe est testée sans douleur. Les manœuvres de conflit restent négatives et le rythme scapulo-huméral est restauré sur toute l\'amplitude.',
        limitations: 'Aucune limitation résiduelle rapportée : le travail sur écran, la conduite et le port de charges du quotidien sont repris sans gêne.',
        diagnostic: 'La disparition des douleurs nocturnes et la restauration du contrôle scapulaire expliquent la reprise des activités professionnelles et domestiques. Aucune déficience ne persiste au terme de la prise en charge.',
        objectifs: 'L\'objectif antalgique, la récupération des amplitudes et la reprise des activités professionnelles sans gêne sont atteints. La reprise de la natation n\'est que partiellement atteinte, à une fréquence inférieure à celle souhaitée.',
        traitement: 'La prise en charge est arrêtée. La patiente poursuit en autonomie un programme d\'entretien de la coiffe et des fixateurs de scapula, trois fois par semaine, et reprend progressivement la natation en évitant d\'abord les nages avec passage du bras au-dessus de la tête. Elle reconsultera en cas de réapparition des douleurs nocturnes ou de perte d\'amplitude.',
      },
    },
  ],
};

module.exports = { STYLE_PRINCIPLES, STYLE_EXAMPLES };
