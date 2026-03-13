/**
 * pubmedService.js — Enrichissement automatique de la base PubMed (studies_v3).
 *
 * Deux fonctions principales :
 * 1. scheduledPipeline() — Cron hebdo/mensuel, collecte les dernières études kiné
 * 2. onDemandEnrich(queryEN) — Appelé si 0 résultats biblio, enrichit sur la question user
 *
 * Flow commun : PubMed ESearch → EFetch XML → pubmed_candidates (dedup) → score → translate → embed → studies_v3
 */

const { XMLParser } = require('fast-xml-parser');
const OpenAI = require('openai');
const { supabase } = require('./supabaseClient');
const logger = require('../utils/logger');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const NCBI_API_KEY = process.env.NCBI_API_KEY || '';
const NCBI_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const SLEEP_MS = NCBI_API_KEY ? 100 : 340;
const MAX_RETRIES = 3;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['PubmedArticle', 'AbstractText', 'Author', 'PublicationType', 'DescriptorName', 'ArticleId'].includes(name),
});

// ==========================================
// PROMPTS
// ==========================================

const SCORE_PROMPT = `Tu es un classificateur pour une base documentaire de kinésithérapie.

TÂCHE : Pour chaque article, détermine s'il est pertinent pour des kinésithérapeutes.

PERTINENT = rééducation musculosquelettique, exercice thérapeutique, douleur, biomécanique, neurologie motrice (AVC, Parkinson, SEP), respiratoire (BPCO, kiné respi), gériatrie (chutes, équilibre, sarcopénie), pelvi-périnéologie, sport/blessures sportives, post-chirurgical orthopédique, tests cliniques/diagnostiques en kiné.

RÈGLE IMPORTANTE : Dès qu'un article implique de l'exercice physique, de l'activité physique, ou de l'entraînement physique comme intervention (même dans un contexte non kiné comme le cancer, le diabète, la cardiologie), il est PERTINENT. L'exercice est au cœur de la kinésithérapie.

NON PERTINENT = pharmacologie pure SANS exercice, chirurgie sans rééducation, imagerie diagnostique seule, biologie moléculaire, génétique, épidémiologie pure sans intervention.

Pour chaque article, retourne :
- id: le numéro de l'article
- keep: true/false
- cat: MSK|Neuro|Respi|Gériatrie|Pelvi|Sport|Post-Chir|Douleur|Autre

RÉPONDRE EN JSON STRICT : {"results":[{"id":1,"keep":true,"cat":"MSK"}, ...]}`;

const TRANSLATE_PROMPT = `Tu es un traducteur médical spécialisé en kinésithérapie/physiothérapie.

TÂCHE : Traduire l'abstract EN→FR et générer un header contextuel.

RÈGLES TRADUCTION :
- Terminologie médicale française exacte (ex: "rotator cuff" → "coiffe des rotateurs", "range of motion" → "amplitude articulaire", "low back pain" → "lombalgie")
- Conserver la structure IMRAD si présente (Contexte/Objectif/Méthodes/Résultats/Conclusion)
- Ne rien ajouter, ne rien résumer — traduction fidèle intégrale
- Garder les valeurs numériques, p-values, intervalles de confiance tels quels

RÈGLES HEADER :
- Format : [TYPE_ÉTUDE | CATÉGORIE | ZONE_ANATOMIQUE | PATHOLOGIE]
- TYPE_ÉTUDE : RCT, Revue Systématique, Méta-Analyse, Essai Clinique, Revue
- CATÉGORIE parmi : MSK, Neurologie, Respiratoire, Gériatrie, Pelvi-Périnéologie, Post-Chirurgical, Sport, Douleur, Cardio, Pédiatrie, Autre
- ZONE_ANATOMIQUE : épaule, genou, hanche, cheville/pied, rachis cervical, rachis thoracique, rachis lombaire, poignet/main, coude, global. Si aucune zone spécifique, OMETTRE ce champ du header.
- PATHOLOGIE : terme spécifique (ex: tendinopathie, gonarthrose, AVC, BPCO, lombalgie chronique)

Exemples de headers :
- Avec zone : "RCT | MSK | épaule | tendinopathie de la coiffe"
- Sans zone : "Revue Systématique | Respiratoire | BPCO"

RÉPONDRE EN JSON STRICT :
{"header": "...", "abstract_fr": "..."}`;

// ==========================================
// QUERIES PRÉDÉFINIES (identiques à collect_pmids.py)
// ==========================================

const SCHEDULED_QUERIES = [
  // 1 — Physical therapy broad
  `("physical therapy modalities"[MeSH] OR "musculoskeletal manipulations"[MeSH] OR "exercise therapy"[MeSH] OR "rehabilitation"[MeSH] OR "physiotherapy"[tiab]) AND hasabstract AND "humans"[MeSH] AND ("english"[lang] OR "french"[lang]) AND ("Randomized Controlled Trial"[pt] OR "Systematic Review"[pt] OR "Meta-Analysis"[pt] OR "Clinical Trial"[pt] OR "Review"[pt])`,
  // 2 — Musculoskeletal + exercise
  `("musculoskeletal diseases"[MeSH] OR "musculoskeletal pain"[MeSH]) AND "exercise therapy"[MeSH] AND hasabstract AND "humans"[MeSH] AND ("english"[lang] OR "french"[lang]) AND ("Randomized Controlled Trial"[pt] OR "Systematic Review"[pt] OR "Meta-Analysis"[pt])`,
  // 3 — Pain + physical therapy
  `("pain management"[MeSH] OR "chronic pain"[MeSH] OR "acute pain"[MeSH]) AND ("physical therapy modalities"[MeSH] OR "physiotherapy"[tiab]) AND hasabstract AND "humans"[MeSH] AND ("english"[lang] OR "french"[lang]) AND ("Randomized Controlled Trial"[pt] OR "Systematic Review"[pt] OR "Meta-Analysis"[pt])`,
  // 4 — Sports injuries
  `("athletic injuries"[MeSH] OR "sports injuries"[tiab]) AND "rehabilitation"[MeSH] AND hasabstract AND "humans"[MeSH] AND ("english"[lang] OR "french"[lang]) AND ("Randomized Controlled Trial"[pt] OR "Systematic Review"[pt] OR "Meta-Analysis"[pt])`,
  // 5 — Neuro-rééducation
  `("stroke rehabilitation"[MeSH] OR "parkinson disease"[MeSH] OR "multiple sclerosis"[MeSH] OR "spinal cord injuries"[MeSH] OR "brain injuries"[MeSH]) AND ("physical therapy modalities"[MeSH] OR "exercise therapy"[MeSH] OR "rehabilitation"[MeSH]) AND hasabstract AND "humans"[MeSH] AND ("english"[lang] OR "french"[lang]) AND ("Randomized Controlled Trial"[pt] OR "Systematic Review"[pt] OR "Meta-Analysis"[pt])`,
  // 6 — Respiratoire
  `("pulmonary disease, chronic obstructive"[MeSH] OR "respiratory therapy"[MeSH] OR "breathing exercises"[MeSH] OR "pulmonary rehabilitation"[tiab] OR "COVID-19"[MeSH]) AND ("physical therapy modalities"[MeSH] OR "exercise therapy"[MeSH] OR "rehabilitation"[MeSH]) AND hasabstract AND "humans"[MeSH] AND ("english"[lang] OR "french"[lang]) AND ("Randomized Controlled Trial"[pt] OR "Systematic Review"[pt] OR "Meta-Analysis"[pt])`,
  // 7 — Gériatrie
  `("accidental falls"[MeSH] OR "postural balance"[MeSH] OR "sarcopenia"[MeSH] OR "frailty"[MeSH] OR "aged"[MeSH]) AND ("exercise therapy"[MeSH] OR "physical therapy modalities"[MeSH]) AND hasabstract AND "humans"[MeSH] AND ("english"[lang] OR "french"[lang]) AND ("Randomized Controlled Trial"[pt] OR "Systematic Review"[pt] OR "Meta-Analysis"[pt])`,
  // 8 — Pelvi-périnéologie
  `("urinary incontinence"[MeSH] OR "pelvic floor"[MeSH] OR "pelvic floor disorders"[MeSH] OR "postpartum period"[MeSH]) AND ("exercise therapy"[MeSH] OR "physical therapy modalities"[MeSH]) AND hasabstract AND "humans"[MeSH] AND ("english"[lang] OR "french"[lang]) AND ("Randomized Controlled Trial"[pt] OR "Systematic Review"[pt] OR "Meta-Analysis"[pt])`,
  // 9 — Post-chirurgical
  `("arthroplasty, replacement"[MeSH] OR "anterior cruciate ligament reconstruction"[MeSH] OR "rotator cuff"[MeSH] OR "spinal fusion"[MeSH] OR "postoperative care"[MeSH]) AND ("physical therapy modalities"[MeSH] OR "exercise therapy"[MeSH] OR "rehabilitation"[MeSH]) AND hasabstract AND "humans"[MeSH] AND ("english"[lang] OR "french"[lang]) AND ("Randomized Controlled Trial"[pt] OR "Systematic Review"[pt] OR "Meta-Analysis"[pt])`,
  // 10 — LCA BTB vs DIDT
  `("anterior cruciate ligament reconstruction"[MeSH] OR "anterior cruciate ligament"[tiab]) AND ("bone-patellar tendon-bone"[tiab] OR "patellar tendon"[tiab] OR "BTB"[tiab] OR "hamstring tendon"[tiab] OR "semitendinosus"[tiab] OR "gracilis"[tiab] OR "DIDT"[tiab] OR "four-strand"[tiab]) AND hasabstract AND "humans"[MeSH] AND ("english"[lang] OR "french"[lang]) AND ("Randomized Controlled Trial"[pt] OR "Systematic Review"[pt] OR "Meta-Analysis"[pt] OR "Review"[pt])`,
];

// ==========================================
// CORE : PubMed API
// ==========================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ncbiGet(url) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      const wait = 2 ** attempt * 1000;
      logger.warn(`NCBI attempt ${attempt} failed: ${err.message} — retry in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw new Error(`NCBI request failed after ${MAX_RETRIES} retries`);
}

/**
 * ESearch — retourne un tableau de PMIDs
 */
async function esearch(query, { retmax = 20, sort = 'relevance' } = {}) {
  const params = new URLSearchParams({
    db: 'pubmed',
    term: query,
    retmax: String(retmax),
    retmode: 'json',
    sort,
  });
  if (NCBI_API_KEY) params.set('api_key', NCBI_API_KEY);

  const url = `${NCBI_BASE}/esearch.fcgi?${params}`;
  const raw = await ncbiGet(url);
  const data = JSON.parse(raw);
  return {
    pmids: data.esearchresult?.idlist || [],
    total: parseInt(data.esearchresult?.count || '0', 10),
  };
}

/**
 * ESearch paginé — récupère tous les PMIDs (blocs de 1000)
 */
async function esearchAll(query, { dateFilter = null } = {}) {
  let fullQuery = query;
  if (dateFilter) {
    fullQuery += ` AND ${dateFilter}`;
  }

  const RETMAX = 1000;
  const first = await esearch(fullQuery, { retmax: RETMAX });
  const allPmids = [...first.pmids];
  const total = first.total;
  // logger.debug(`  ESearch: ${total} résultats trouvés`);

  let retstart = RETMAX;
  while (retstart < total) {
    await sleep(SLEEP_MS);
    const params = new URLSearchParams({
      db: 'pubmed',
      term: fullQuery,
      retmax: String(RETMAX),
      retstart: String(retstart),
      retmode: 'json',
    });
    if (NCBI_API_KEY) params.set('api_key', NCBI_API_KEY);

    const url = `${NCBI_BASE}/esearch.fcgi?${params}`;
    const raw = await ncbiGet(url);
    const data = JSON.parse(raw);
    const ids = data.esearchresult?.idlist || [];
    if (ids.length === 0) break;
    allPmids.push(...ids);
    retstart += RETMAX;
  }

  return allPmids;
}

/**
 * EFetch XML — récupère les détails des articles
 */
async function efetchArticles(pmids) {
  if (pmids.length === 0) return [];

  const params = new URLSearchParams({
    db: 'pubmed',
    id: pmids.join(','),
    retmode: 'xml',
    rettype: 'abstract',
  });
  if (NCBI_API_KEY) params.set('api_key', NCBI_API_KEY);

  const url = `${NCBI_BASE}/efetch.fcgi?${params}`;
  const xml = await ncbiGet(url);
  return parseArticlesXml(xml);
}

/**
 * Parse le XML EFetch en tableau d'articles
 */
function parseArticlesXml(xml) {
  const parsed = xmlParser.parse(xml);
  const pubmedArticles = parsed?.PubmedArticleSet?.PubmedArticle || [];
  const articles = [];

  for (const pa of pubmedArticles) {
    const citation = pa.MedlineCitation;
    if (!citation) continue;

    const pmid = String(citation.PMID?.['#text'] || citation.PMID || '');
    if (!pmid) continue;

    const article = citation.Article || {};

    // Title
    const title = typeof article.ArticleTitle === 'string'
      ? article.ArticleTitle
      : article.ArticleTitle?.['#text'] || '';

    // Abstract
    const abstractTexts = article.Abstract?.AbstractText || [];
    const abstractParts = [];
    for (const at of (Array.isArray(abstractTexts) ? abstractTexts : [abstractTexts])) {
      if (typeof at === 'string') {
        abstractParts.push(at);
      } else if (at?.['#text']) {
        const label = at['@_Label'] || '';
        abstractParts.push(label ? `${label}: ${at['#text']}` : at['#text']);
      }
    }
    const abstract = abstractParts.join('\n\n') || null;

    // Authors
    const authorList = article.AuthorList?.Author || [];
    const authorNames = [];
    for (const auth of (Array.isArray(authorList) ? authorList : [authorList])) {
      const last = auth.LastName || '';
      const fore = auth.ForeName || '';
      const name = `${last} ${fore}`.trim();
      if (name) authorNames.push(name);
    }
    const authors = authorNames.length > 1
      ? `${authorNames[0]} et al.`
      : authorNames[0] || null;

    // Year
    const pubDate = article.Journal?.JournalIssue?.PubDate || {};
    let year = parseInt(pubDate.Year, 10) || null;
    if (!year && pubDate.MedlineDate) {
      const m = String(pubDate.MedlineDate).match(/^(\d{4})/);
      if (m) year = parseInt(m[1], 10);
    }

    // Publication types
    const pubTypes = [];
    const ptList = article.PublicationTypeList?.PublicationType || [];
    for (const pt of (Array.isArray(ptList) ? ptList : [ptList])) {
      const t = typeof pt === 'string' ? pt : pt?.['#text'] || '';
      if (t) pubTypes.push(t);
    }

    // MeSH terms
    const meshTerms = [];
    const meshList = citation.MeshHeadingList?.MeshHeading || [];
    for (const mh of (Array.isArray(meshList) ? meshList : [meshList])) {
      const desc = mh?.DescriptorName;
      if (Array.isArray(desc)) {
        for (const d of desc) {
          const t = typeof d === 'string' ? d : d?.['#text'] || '';
          if (t) meshTerms.push(t);
        }
      } else if (desc) {
        const t = typeof desc === 'string' ? desc : desc?.['#text'] || '';
        if (t) meshTerms.push(t);
      }
    }

    // DOI
    const articleIds = pa.PubmedData?.ArticleIdList?.ArticleId || [];
    let doi = null;
    for (const aid of (Array.isArray(articleIds) ? articleIds : [articleIds])) {
      if (aid?.['@_IdType'] === 'doi') {
        doi = aid['#text'] || null;
      }
    }

    articles.push({
      pmid,
      title,
      abstract,
      authors,
      year,
      publication_types: pubTypes,
      mesh_terms: meshTerms,
      doi,
      pubmed_url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      doi_url: doi ? `https://doi.org/${doi}` : null,
    });
  }

  return articles;
}

// ==========================================
// CORE : Insert pubmed_candidates (dedup)
// ==========================================

async function insertCandidates(articles, status = 'pending') {
  if (articles.length === 0) return { inserted: 0, skipped: 0 };

  const rows = articles.map(a => ({
    pmid: a.pmid,
    title: a.title,
    abstract: a.abstract,
    authors: a.authors,
    year: a.year,
    publication_types: a.publication_types,
    mesh_terms: a.mesh_terms,
    doi: a.doi,
    pubmed_url: a.pubmed_url,
    doi_url: a.doi_url,
    status,
    fetched_at: new Date().toISOString(),
  }));

  const { data } = await supabase
    .from('pubmed_candidates')
    .upsert(rows, { onConflict: 'pmid', ignoreDuplicates: true })
    .select('pmid');

  const inserted = data?.length || 0;
  return { inserted, skipped: articles.length - inserted };
}

// ==========================================
// CORE : Scoring GPT
// ==========================================

async function scoreArticles(articles) {
  if (articles.length === 0) return [];

  const lines = articles.map((a, i) => {
    const mesh = (a.mesh_terms || []).slice(0, 8).join(', ') || 'N/A';
    return `${i + 1}. Titre: ${a.title} | MeSH: ${mesh}`;
  });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SCORE_PROMPT },
      { role: 'user', content: lines.join('\n') },
    ],
  });

  const raw = JSON.parse(response.choices[0].message.content);
  const results = raw.results || (Array.isArray(raw) ? raw : []);

  // Update pubmed_candidates
  const kept = [];
  for (const score of results) {
    const idx = score.id - 1;
    if (idx >= articles.length) continue;
    const art = articles[idx];
    const status = score.keep ? 'keep' : 'rejected';
    const category = score.cat || 'Autre';

    await supabase
      .from('pubmed_candidates')
      .update({ status, category })
      .eq('pmid', art.pmid);

    if (score.keep) {
      kept.push({ ...art, category });
    }
  }

  return kept;
}

// ==========================================
// CORE : Translate + Embed + Upsert studies_v3
// ==========================================

async function translateArticle(article) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: TRANSLATE_PROMPT },
          {
            role: 'user',
            content: `Titre : ${article.title}\nAuteurs : ${article.authors}\nAnnée : ${article.year}\nAbstract : ${article.abstract}`,
          },
        ],
      });
      return JSON.parse(response.choices[0].message.content);
    } catch (err) {
      const wait = 2 ** attempt * 1000;
      logger.warn(`Translate attempt ${attempt} for ${article.pmid}: ${err.message} — retry in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw new Error(`Translate failed for ${article.pmid} after ${MAX_RETRIES} retries`);
}

async function embedText(text) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-large',
        input: text,
        dimensions: 1536,
      });
      return response.data[0].embedding;
    } catch (err) {
      const wait = 2 ** attempt * 1000;
      logger.warn(`Embed attempt ${attempt}: ${err.message} — retry in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw new Error(`Embed failed after ${MAX_RETRIES} retries`);
}

async function processArticle(article) {
  // 1. Translate
  const translation = await translateArticle(article);
  const chunk = `${translation.header} ${article.authors} (${article.year})\n\n${translation.abstract_fr}`;

  // 2. Embed title+abstract EN
  const textEN = `${article.title} ${article.abstract}`;
  const embedding = await embedText(textEN);

  // 3. Insert studies_v3 (ignoreDuplicates: si PMID existe déjà, ne pas écraser)
  await supabase.from('studies_v3').upsert({
    pmid: article.pmid,
    title: article.title,
    abstract: article.abstract,
    authors: article.authors,
    chunk,
    year: article.year,
    publication_types: article.publication_types || [],
    doi: article.doi,
    pubmed_url: article.pubmed_url,
    doi_url: article.doi_url,
    category: article.category || 'Autre',
    embedding,
  }, { onConflict: 'pmid', ignoreDuplicates: true });

  // 4. Mark processed in pubmed_candidates
  await supabase
    .from('pubmed_candidates')
    .update({ status: 'processed' })
    .eq('pmid', article.pmid);

  return { pmid: article.pmid, title: article.title, chunk: chunk.substring(0, 80) };
}

// ==========================================
// FONCTION 1 : Scheduled Pipeline (cron)
// ==========================================

/**
 * Pipeline planifié — collecte les dernières études kiné publiées.
 * @param {object} options
 * @param {string} options.dateFilter - Filtre date PubMed, ex: "2026/03/05:2026/03/12[pdat]"
 * @param {number} options.maxPerQuery - Max PMIDs par query (défaut: 100)
 */
async function scheduledPipeline({ dateFilter = null, maxPerQuery = 100 } = {}) {
  const startTime = Date.now();
  const stats = { queries: 0, pmidsFound: 0, inserted: 0, scored: 0, kept: 0, processed: 0, errors: 0 };

  // Auto date filter: dernières 24h si non spécifié (cron quotidien)
  if (!dateFilter) {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const fmt = d => `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
    dateFilter = `${fmt(threeDaysAgo)}:${fmt(now)}[pdat]`;
  }

  // ÉTAPE 1 : Collect PMIDs
  const allPmids = new Set();
  for (let i = 0; i < SCHEDULED_QUERIES.length; i++) {
    stats.queries++;
    try {
      const pmids = await esearchAll(SCHEDULED_QUERIES[i], { dateFilter });
      pmids.forEach(p => allPmids.add(p));
    } catch (err) {
      stats.errors++;
    }
    await sleep(SLEEP_MS);
  }
  stats.pmidsFound = allPmids.size;

  if (allPmids.size === 0) {
    logger.warn('[CRON PubMed] Fetch quotidien — 0 articles trouvés');
    return stats;
  }

  // ÉTAPE 2 : EFetch par batches de 200
  const pmidArray = [...allPmids];
  const allArticles = [];
  for (let i = 0; i < pmidArray.length; i += 200) {
    const batch = pmidArray.slice(i, i + 200);
    try {
      const articles = await efetchArticles(batch);
      allArticles.push(...articles);
    } catch (err) {
      stats.errors++;
    }
    await sleep(SLEEP_MS);
  }

  // ÉTAPE 3 : Insert candidates (dedup via pubmed_candidates, ON CONFLICT DO NOTHING)
  const { inserted, skipped } = await insertCandidates(allArticles, 'pending');
  stats.inserted = inserted;

  if (inserted === 0) {
    logger.warn(`[CRON PubMed] Fetch quotidien — ${allPmids.size} articles trouvés, 0 nouveaux`);
    return stats;
  }

  // ÉTAPE 4 : Score seulement les articles nouvellement insérés (batches de 10)
  const insertedPmids = new Set();
  const { data: pendingRows } = await supabase
    .from('pubmed_candidates')
    .select('pmid')
    .in('pmid', allArticles.map(a => a.pmid))
    .eq('status', 'pending');
  for (const row of (pendingRows || [])) {
    insertedPmids.add(row.pmid);
  }
  const newArticles = allArticles.filter(a => insertedPmids.has(a.pmid) && a.title && a.abstract);

  // ÉTAPE 5 : Score (batches de 10) + Translate + Embed les kept (5 workers parallèles)
  for (let i = 0; i < newArticles.length; i += 10) {
    const batch = newArticles.slice(i, i + 10);
    try {
      const kept = await scoreArticles(batch);
      stats.scored += batch.length;
      stats.kept += kept.length;

      for (let j = 0; j < kept.length; j += 5) {
        const workerBatch = kept.slice(j, j + 5);
        const results = await Promise.allSettled(
          workerBatch.map(art => processArticle(art))
        );
        for (let k = 0; k < results.length; k++) {
          if (results[k].status === 'fulfilled') {
            stats.processed++;
          } else {
            stats.errors++;
          }
        }
      }
    } catch (err) {
      stats.errors++;
    }
  }

  logger.warn(`[CRON PubMed] Fetch quotidien — ${stats.pmidsFound} articles trouvés, ${stats.inserted} nouveaux, ${stats.processed} insérés en base${stats.errors > 0 ? `, ${stats.errors} erreurs` : ''}`);

  return stats;
}

// ==========================================
// FONCTION 2 : On-Demand Enrichment
// ==========================================

/**
 * Enrichissement à la demande — appelé quand 0 résultats biblio.
 * Recherche PubMed avec la query EN du rewriter, top 5 (RCT/Review/Meta/Systematic).
 * Ne bloque pas la réponse user (fire-and-forget).
 *
 * @param {string} queryEN - Query EN optimisée (sortie du query rewriter)
 * @returns {object} stats
 */
async function onDemandEnrich(queryEN) {
  const startTime = Date.now();
  const stats = { pmidsFound: 0, inserted: 0, processed: 0, errors: 0 };

  logger.debug(`=== ON-DEMAND ENRICHMENT: "${queryEN.substring(0, 80)}" ===`);

  try {
    // ÉTAPE 1 : ESearch ciblé (top 5, filtre article types)
    const filteredQuery = `(${queryEN}) AND hasabstract AND "humans"[MeSH]`;

    const { pmids } = await esearch(filteredQuery, { retmax: 5, sort: 'relevance' });
    stats.pmidsFound = pmids.length;

    if (pmids.length > 0) {
      // ÉTAPE 2 : EFetch
      const articles = await efetchArticles(pmids);

      // ÉTAPE 3 : Dedup via studies_v3 (pas pubmed_candidates)
      const { data: existingRows } = await supabase
        .from('studies_v3')
        .select('pmid')
        .in('pmid', articles.map(a => a.pmid));
      const existingPmids = new Set((existingRows || []).map(r => r.pmid));

      const toProcess = articles
        .filter(art => !existingPmids.has(art.pmid) && art.abstract)
        .map(art => ({ ...art, category: 'Autre' }));

      stats.inserted = toProcess.length;

      if (toProcess.length > 0) {
        // ÉTAPE 4 : Translate + Embed en parallèle (pas de scoring, query user = pertinent par définition)
        const results = await Promise.allSettled(
          toProcess.map(art => processArticle(art))
        );
        for (let k = 0; k < results.length; k++) {
          if (results[k].status === 'fulfilled') {
            stats.processed++;
          } else {
            stats.errors++;
          }
        }
      }
    }
  } catch (err) {
    stats.errors++;
    logger.error(`[On-demand PubMed] ERREUR: ${err.message}`);
  }

  logger.warn(`[On-demand PubMed] "${queryEN.substring(0, 60)}" — ${stats.pmidsFound} PubMed, ${stats.inserted} nouveaux, ${stats.processed} insérés${stats.errors > 0 ? `, ${stats.errors} erreurs` : ''}`);

  return stats;
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // Fonctions principales
  scheduledPipeline,
  onDemandEnrich,
  // Core functions (pour tests)
  esearch,
  esearchAll,
  efetchArticles,
  parseArticlesXml,
  insertCandidates,
  scoreArticles,
  translateArticle,
  embedText,
  processArticle,
};
