// Minutes gagnées par type d'activité (barème produit — cf. spec refonte accueil)
const MINUTES_BY_TYPE = {
  IA_SEARCH: 30,
  BILAN_GENERATED: 15,
  PROGRAMME_CREATED: 15,
  ADMIN_LETTER: 10,
  CONTRACT_CREATED: 30,
};

// Somme des minutes gagnées à partir d'un groupBy Prisma [{ type, _count:{_all} }]
function sumMinutes(grouped) {
  return grouped.reduce((total, row) => total + (MINUTES_BY_TYPE[row.type] || 0) * row._count._all, 0);
}

module.exports = { MINUTES_BY_TYPE, sumMinutes };
