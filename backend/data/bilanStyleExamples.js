// Exemples de STYLE pour la rédaction IA du bilan. Chaque exemple montre des NOTES et le bilan tiré de
// ces notes (spec 2026-09-23) : le modèle y voit la fidélité à l'œuvre, pas seulement une sortie.
// Règle non négociable : chaque fait du texte est traçable dans les notes de l'exemple (vérifié par
// Jest : nombres et tests nommés). Le modèle doit en imiter la forme, jamais en reprendre le contenu :
// les notes restent pauvres en chiffres réutilisables pour ne rien injecter dans un bilan réel.

const STYLE_EXAMPLES = {
  INITIAL: [
    {
      title: 'Lombalgie commune subaiguë, bilan initial',
      notes: [
        'maçon ; lombalgie basse depuis 3 mois, début progressif, période de port de charges répété, pas de trauma',
        'dlr mécanique, pire en station assise prolongée et aux transferts assis-debout',
        'en AT depuis 3 sem ; appréhension ++ de la flexion ; veut reprendre son poste',
        'ATCD : hernie discale L4-L5 opérée 2018 ; antalgiques palier 1 à la demande',
        'délordose, transferts difficiles, flexion lombaire limitée et dlr en fin d\'amplitude',
        'contracture paravertébraux D, dlr à la pression L4-L5, irradiation fessière D non systématisée',
        'Lasègue - ddc, sonnette -',
        'endurance extenseurs du tronc insuffisante, contrôle de la flexion insuffisant, dissociation hanches-rachis difficile',
        'assis 30 min max ; évite le port de charges ; ne supporte pas d\'être penché en avant ; a arrêté le vélo par peur de la dlr',
        'lombalgie commune subaiguë, pas d\'argument pour une radiculalgie',
        'obj CT : moins de dlr et d\'appréhension, flexion indolore / MT : endurance et contrôle du tronc, tenir assis plus longtemps, port de charges modérées / LT : reprise du travail, du vélo, entretien en autonomie',
        '2 séances/sem pdt 6 sem, réévaluation à mi-parcours ; d\'abord dlr + mobilité en flexion, puis endurance et contrôle du tronc, puis gestes du métier ; rester actif, exos à la maison',
      ].join('\n'),
      sections: {
        anamnese: '[Prénom] [NOM], [âge] ans, maçon, consulte pour une lombalgie basse évoluant depuis trois mois, apparue progressivement lors d\'une période de port de charges répété, sans traumatisme. La douleur est de rythme mécanique, majorée par la station assise prolongée et les transferts assis-debout. En arrêt de travail depuis trois semaines, il exprime une appréhension marquée de la flexion et souhaite reprendre son poste.',
        antecedents: 'Hernie discale L4-L5 opérée en 2018. Antalgiques de palier 1 à la demande.',
        examen: 'L\'attitude est en délordose et les transferts sont difficiles, avec une mobilité lombaire limitée et douloureuse en fin de flexion. La palpation retrouve une contracture des paravertébraux droits et une douleur à la pression de L4-L5 ; l\'irradiation fessière droite n\'est pas systématisée. Le Lasègue est négatif des deux côtés et la sonnette est absente. L\'endurance des extenseurs du tronc et le contrôle de la flexion sont insuffisants, et la dissociation hanches-rachis reste difficile.',
        limitations: 'Il ne tient pas la station assise plus de trente minutes, évite le port de charges et ne supporte pas la position penchée en avant. Il a arrêté le vélo par crainte de la douleur.',
        diagnostic: 'Le bilan oriente vers une lombalgie commune subaiguë, sans argument pour une atteinte radiculaire.',
        objectifs: 'À court terme, la rééducation vise à diminuer la douleur et l\'appréhension du mouvement pour retrouver une flexion indolore. À moyen terme, elle doit rétablir l\'endurance et le contrôle du tronc, allonger le temps de station assise toléré et permettre le port de charges modérées. Les objectifs à long terme sont la reprise du travail, le retour au vélo et la poursuite d\'un programme d\'entretien en autonomie.',
        traitement: 'Le traitement comprend deux séances hebdomadaires pendant six semaines, réévaluées à mi-parcours. Il vise d\'abord la diminution de la douleur et la mobilité en flexion, puis l\'endurance et le contrôle du tronc, avant le réentraînement aux gestes du métier. Le patient est encouragé à rester actif et à poursuivre ses exercices à domicile.',
      },
    },
  ],
  INTERMEDIAIRE: [
    {
      title: 'Ligamentoplastie du genou droit (DIDT), bilan intermédiaire à six semaines',
      notes: [
        'patiente revue à 6 sem d\'une ligamentoplastie du LCA du genou D (DIDT)',
        'se sent plus en confiance sur son genou depuis 15 j, gênée surtout en fin de journée',
        'ATCD : entorse cheville D à l\'adolescence, sans séquelle',
        'épanchement discret, cicatrice propre et souple',
        'flexion progresse mais bute en fin de course ; flessum en extension passive',
        'quadriceps hypotrophié vs côté sain, verrouillage en charge insuffisant, boiterie',
        'pas de test ligamentaire, consigne du chir',
        'marche sans aide sur terrain plat ; escaliers, accroupi et relevé du sol difficiles, gênant au travail (auxiliaire de puériculture) ; pas de reprise du sport',
        'évolution conforme au délai post-op ; ce qui gêne le plus : flessum + amyotrophie quadri',
        'obj du bilan précédent : appui complet OK, épanchement régressé ; extension complète et verrouillage actif pas encore → CT',
        'MT : flexion fonctionnelle, force quadri symétrique, marche et escaliers normaux, reprise du travail / LT : proprio + réathlétisation → reprise du sport',
        '3 séances/sem ; d\'abord amplitude + drainage, puis renfo + proprio ; glace après les séances, exos tous les jours, pas d\'accroupi forcé ni de pivot avant accord du chir',
      ].join('\n'),
      sections: {
        anamnese: '[Prénom] [NOM], [âge] ans, est revue à six semaines d\'une ligamentoplastie du ligament croisé antérieur du genou droit par DIDT. Elle se sent plus en confiance sur son genou depuis une quinzaine de jours et reste gênée surtout en fin de journée.',
        antecedents: 'Entorse de la cheville droite à l\'adolescence, sans séquelle.',
        examen: 'L\'épanchement est discret et la cicatrice est propre et souple. La flexion progresse mais bute en fin de course, et un flessum persiste en extension passive. Le quadriceps est hypotrophié par rapport au côté sain, le verrouillage en charge est insuffisant et la patiente boite. Aucun test ligamentaire n\'est réalisé, sur consigne du chirurgien.',
        limitations: 'La patiente marche sans aide sur terrain plat, mais les escaliers, la position accroupie et le relevé du sol restent difficiles, ce qui la gêne dans son travail d\'auxiliaire de puériculture. Elle n\'a pas repris le sport.',
        diagnostic: 'L\'évolution est conforme au délai post-opératoire. Le flessum et l\'amyotrophie du quadriceps sont ce qui gêne le plus aujourd\'hui.',
        objectifs: 'Les objectifs du bilan précédent sont en partie atteints : l\'appui complet est acquis et l\'épanchement a régressé, mais l\'extension complète et le verrouillage actif restent à obtenir à court terme. À moyen terme, il s\'agit de retrouver une flexion fonctionnelle, une force symétrique du quadriceps, une marche et des escaliers normaux, et de reprendre le travail. À long terme, la proprioception et la réathlétisation doivent permettre la reprise du sport.',
        traitement: 'Le traitement comprend trois séances hebdomadaires. Il vise d\'abord l\'amplitude et le drainage, puis le renforcement et la proprioception. La patiente glace après les séances, fait ses exercices chaque jour et évite l\'accroupissement forcé et les pivots jusqu\'à l\'accord du chirurgien.',
      },
    },
  ],
  FINAL: [
    {
      title: 'Conflit sous-acromial de l\'épaule droite, bilan de fin de prise en charge',
      notes: [
        'patiente, fin de prise en charge de l\'épaule D, commencée il y a 4 mois',
        'ATCD : tendinopathie de la coiffe traitée médicalement en 2022, pas de rééduc ; aucun antalgique en cours',
        'épaule indolore ; amplitudes actives symétriques ; coiffe testée sans douleur',
        'Neer -, Hawkins - ; rythme scapulo-huméral normal sur toute l\'amplitude',
        'plus aucune gêne sur écran, en voiture ni pour porter les charges du quotidien',
        'plus de dlr nocturne + contrôle scapulaire récupéré → a repris ses activités pro et domestiques ; plus de déficience',
        'obj : antalgie atteinte, amplitudes atteintes, reprise du travail sans gêne atteinte ; natation partiellement (moins souvent que souhaité)',
        'arrêt de la PEC ; entretien coiffe + fixateurs de scapula 3x/sem en autonomie ; reprise progressive de la natation, éviter au début les nages bras au-dessus de la tête ; reconsulter si dlr nocturnes ou perte d\'amplitude',
      ].join('\n'),
      sections: {
        anamnese: '[Prénom] [NOM], [âge] ans, termine une prise en charge de l\'épaule droite commencée il y a quatre mois.',
        antecedents: 'Tendinopathie de la coiffe traitée médicalement en 2022, sans rééducation. Aucun traitement antalgique en cours.',
        examen: 'L\'épaule est indolore. Les amplitudes actives sont symétriques et la coiffe est testée sans douleur. Les tests de Neer et de Hawkins sont négatifs et le rythme scapulo-huméral est normal sur toute l\'amplitude.',
        limitations: 'La patiente ne rapporte plus aucune gêne sur écran, en voiture ni dans le port des charges du quotidien.',
        diagnostic: 'La disparition des douleurs nocturnes et la récupération du contrôle scapulaire ont permis la reprise des activités professionnelles et domestiques. Aucune déficience ne persiste.',
        objectifs: 'L\'objectif antalgique, la récupération des amplitudes et la reprise du travail sans gêne sont atteints. La reprise de la natation n\'est que partiellement atteinte, à une fréquence inférieure à celle souhaitée.',
        traitement: 'La prise en charge est arrêtée. La patiente poursuit en autonomie un programme d\'entretien de la coiffe et des fixateurs de la scapula, trois fois par semaine, et reprend progressivement la natation en évitant au début les nages bras au-dessus de la tête. Elle reconsultera en cas de douleurs nocturnes ou de perte d\'amplitude.',
      },
    },
  ],
};

module.exports = { STYLE_EXAMPLES };
