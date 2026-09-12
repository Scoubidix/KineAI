// Vocabulaire kiné donné à Whisper en amorce (initial_prompt) : oriente l'orthographe des tests,
// cotations et abréviations lus à voix haute. Environ 60 mots, jamais plus de 200 avec le contexte.
const DICTATION_VOCABULARY = [
  'Bilan kinésithérapique.', 'DN4', 'ATCD', 'ROM', 'RE1', 'DIDT', 'LCA', 'LLE', 'Ottawa',
  'Lasègue', 'Bragard', 'Schober', 'Sorensen', 'McKenzie', 'Lachman', 'McMurray', 'Thessaly', 'Apley', 'Neer', 'Jobe',
  'Hawkins-Kennedy', 'Yocum', 'Patte', 'Gerber', 'Speed', 'Yergason', 'Spurling', 'Phalen', 'Tinel',
  // « EVA » en tête de l'amorce faisait transcrire les « euh » en « EVA » (vu sur les séances)
  'EVA', 'Cozen', 'Thompson',
  'Kleiger', 'FADIR', 'FABER', 'Trendelenburg', 'Thomas', 'Jamar', 'knee to wall', 'squeeze test',
  'flexion', 'extension', 'abduction', 'adduction', 'rotation interne', 'rotation externe', 'inclinaison',
  'testing quatre sur cinq', 'ischio-jambiers', 'quadriceps', 'moyen fessier', 'fibulaires', 'triceps sural',
  'paravertébraux', 'supra-épineux', 'coiffe des rotateurs', 'kinésiophobie', 'paresthésies', 'hypoesthésie',
  'cicatrice', 'œdème', 'proprioception.',
].join(' ');

module.exports = { DICTATION_VOCABULARY };
