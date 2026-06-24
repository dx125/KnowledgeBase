// =============================================================================
// One-click atomic data deploy: dataset files -> Supabase Postgres.
//
//   npm run deploy -- --label "rent polish" --notes "fixed deposit cards"
//   npm run deploy -- --dry-run        # build rows + report, no DB writes
//
// How it works
// ------------
// The whole replace runs inside ONE transaction:
//   BEGIN
//     delete all content rows (FK-safe order)
//     insert all content rows from the dataset (FK-safe order)
//     insert one row into kb_data_versions
//   COMMIT
// Readers (the web app's RPCs) keep seeing the previous version on their own
// snapshot until COMMIT, then atomically see the new one. If anything fails the
// transaction rolls back and the live data is untouched — safe to re-run.
//
// Because it is a full replace, it also handles edits, renames and DELETIONS:
// whatever is in the dataset folder becomes the live data, nothing stale lingers.
// =============================================================================

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';
import { applyCardOverrides } from './lib/apply-overrides.mjs';
import { applyNewCards } from './lib/apply-new-cards.mjs';
import { applyFaq } from './lib/apply-faq.mjs';
import { applyQuestions } from './lib/apply-questions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(HERE, '..', '.env') }); // single project-root .env

const LOCALES = ['ru', 'en', 'es', 'de'];

// --- CLI args ----------------------------------------------------------------
const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const DRY_RUN = args.includes('--dry-run');
const LABEL = getArg('label') ?? null;
const NOTES = getArg('notes') ?? null;

const { DATABASE_URL, DATASET_DIR } = process.env;
if (!DATASET_DIR || (!DRY_RUN && !DATABASE_URL)) {
  console.error('Missing env. Required: DATASET_DIR' + (DRY_RUN ? '' : ', DATABASE_URL'));
  console.error('Copy .env.example to .env and fill it in.');
  process.exit(1);
}

// --- Load + hash source ------------------------------------------------------
const FILES = [
  'kb_cards.json',
  'glossary.json',
  'entity_index.json',
  'resources.json',
  ...LOCALES.map((l) => `locale_${l}.json`),
];
const raw = Object.fromEntries(FILES.map((f) => [f, readFileSync(join(DATASET_DIR, f), 'utf-8')]));

const kb = JSON.parse(raw['kb_cards.json']);
const glossary = JSON.parse(raw['glossary.json']);
const entityIndex = JSON.parse(raw['entity_index.json']);
const resourcesFile = JSON.parse(raw['resources.json']);
const locales = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(raw[`locale_${l}.json`])]));
const cards = kb.cards;

// --- Our tracked corrections (reproducible across raw-data drops) -------------
// Re-apply git-owned EN/ES/DE card translations on top of the raw vendor locales.
// See dataset-patches/ + scripts/lib/apply-overrides.mjs.
const OVERRIDES_PATH = join(HERE, '..', 'dataset-patches', 'card-overrides.json');
const overridesRaw = existsSync(OVERRIDES_PATH) ? readFileSync(OVERRIDES_PATH, 'utf-8') : '';
const ov = applyCardOverrides({ cards, locales, overridesPath: OVERRIDES_PATH });
if (ov.unknown.length)
  console.warn(`⚠ overrides reference ${ov.unknown.length} unknown card(s): ${ov.unknown.slice(0, 5).join(', ')}${ov.unknown.length > 5 ? '…' : ''}`);
if (ov.drift.length)
  console.warn(`⚠ RU source changed since translation for ${ov.drift.length} card(s) — re-review: ${ov.drift.slice(0, 5).map((d) => d.cardId).join(', ')}${ov.drift.length > 5 ? '…' : ''}`);
if (ov.cardsTouched)
  console.log(`Overrides: applied EN/ES/DE corrections to ${ov.cardsTouched} card(s) (${ov.applied} locale-fields).`);

// Editorially-authored NEW cards (gaps the vendor build never covered). Appended
// to `cards` and all four locales. See dataset-patches/ + scripts/lib/apply-new-cards.mjs.
const NEW_CARDS_PATH = join(HERE, '..', 'dataset-patches', 'new-cards.json');
const newCardsRaw = existsSync(NEW_CARDS_PATH) ? readFileSync(NEW_CARDS_PATH, 'utf-8') : '';
const nc = applyNewCards({ cards, locales, newCardsPath: NEW_CARDS_PATH });
if (nc.dupes.length)
  console.warn(`⚠ new-cards collide with existing card_id(s) — skipped: ${nc.dupes.join(', ')}`);
if (nc.added)
  console.log(`New cards: added ${nc.added} editorial card(s) (${nc.ids.map((i) => i.split('.').slice(-1)[0]).join(', ')}).`);

// Q&A (FAQ) layer: dedicated topic.faq_* topics + one card per question (content
// _category=faq). Registers the new topics into the taxonomy/locales and appends
// the cards. See dataset-patches/faq.json + scripts/lib/apply-faq.mjs.
const FAQ_PATH = join(HERE, '..', 'dataset-patches', 'faq.json');
const faqRaw = existsSync(FAQ_PATH) ? readFileSync(FAQ_PATH, 'utf-8') : '';
const fq = applyFaq({ kb, cards, locales, faqPath: FAQ_PATH });
if (fq.dupeTopics.length)
  console.warn(`⚠ FAQ topics collide with existing topic_id(s) — skipped: ${fq.dupeTopics.join(', ')}`);
if (fq.dupeCards.length)
  console.warn(`⚠ FAQ cards collide with existing card_id(s) — skipped: ${fq.dupeCards.length}`);
if (fq.topics || fq.questions)
  console.log(`Q&A: added ${fq.topics} FAQ topic(s) and ${fq.questions} answer card(s).`);

// Normalized questions layer: questions that REFERENCE answer-cards (no duplicated
// answers) + ask_frequency. Built after faq so the answer cards exist to FK against.
const QUESTIONS_PATH = join(HERE, '..', 'dataset-patches', 'questions.json');
const questionsRaw = existsSync(QUESTIONS_PATH) ? readFileSync(QUESTIONS_PATH, 'utf-8') : '';
const { questionRows, questionTrRows, stats: qstats } = applyQuestions({ cards, questionsPath: QUESTIONS_PATH });
if (qstats.droppedNoCard.length)
  console.warn(`⚠ ${qstats.droppedNoCard.length} question(s) dropped — answer_card_id not found.`);
if (qstats.added)
  console.log(`Questions: ${qstats.added} question(s) -> answer-cards (${questionTrRows.length} localized phrasing rows).`);

// Hash reflects raw input + our overrides + new cards + Q&A + questions.
const sourceHash = createHash('sha256')
  .update(
    FILES.map((f) => raw[f]).join('\n') +
      '\n@overrides\n' + overridesRaw +
      '\n@newcards\n' + newCardsRaw +
      '\n@faq\n' + faqRaw +
      '\n@questions\n' + questionsRaw,
  )
  .digest('hex');

// --- Topics (from taxonomy + the topic's summary card for message counts) -----
const taxTopics = kb.taxonomies?.topics ?? [];
const summaryByTopic = new Map(
  cards.filter((c) => c.card_type === 'summary').map((c) => [c.topic_id, c]),
);
const topicRows = taxTopics.map((t) => ({
  topic_id: t.topic_id,
  sensitivity: t.sensitivity ?? null,
  default_staleness_risk: t.default_staleness_risk ?? null,
  clean_message_count: summaryByTopic.get(t.topic_id)?.source_stats?.clean_message_count ?? null,
}));

// --- Only import taxonomy entities actually referenced by cards ----------------
const subtopicIds = new Set();
const keywordIds = new Set();
for (const c of cards) {
  (c.subtopic_ids ?? []).forEach((s) => subtopicIds.add(s));
  (c.keyword_ids ?? []).forEach((k) => keywordIds.add(k));
}
// subtopics carry a topic_id in the locale files (same across locales).
const subtopicTopic = (id) => {
  for (const L of Object.values(locales)) {
    const tid = L.subtopics?.[id]?.topic_id;
    if (tid) return tid;
  }
  return null;
};
const subtopicRows = [...subtopicIds].map((subtopic_id) => ({
  subtopic_id,
  topic_id: subtopicTopic(subtopic_id),
}));
const keywordRows = [...keywordIds].map((keyword_id) => ({ keyword_id }));

const cardRow = (c) => ({
  card_id: c.card_id,
  topic_id: c.topic_id,
  card_type: c.card_type,
  content_category: c.content_category ?? null, // editorial category (advice/checklist/warning/...) — v5.9+
  status: c.status,
  visibility: c.visibility,
  confidence: c.confidence ?? null,
  staleness_risk: c.staleness_risk ?? null,
  needs_review: c.needs_review ?? false,
  sensitivity_tags: c.sensitivity_tags ?? [],
  sensitivity_level: c.sensitivity_level ?? null,
  quality_score: c.quality?.score ?? null,
  confidence_score: c.confidence_score ?? c.evidence_strength?.confidence_score ?? null, // C: prefer top-level (v5.3+)
  alignment_score: c.semantic_alignment?.alignment_score ?? null, // H: evidence-support signal (v5.7)
  last_confirmed_date: c.validity?.last_confirmed_date ?? null,
  stale_after_days: c.validity?.stale_after_days ?? null,
  requires_periodic_check: c.validity?.requires_periodic_check ?? null,
  search_boost: c.search_boost ?? 0,
  first_seen_message_date: c.first_seen_message_date ?? null,
  last_updated_from_message_date: c.last_updated_from_message_date ?? null,
  source_stats: c.source_stats ? JSON.stringify(c.source_stats) : null,
  version: c.version ?? null,
});
const cardRows = cards.map(cardRow);

// Link arrays may contain duplicate ids within a single card (v5.10 had 29 cards
// with a repeated keyword_id); dedup so we don't violate the composite PKs.
const uniq = (a) => [...new Set(a ?? [])];
const cardSubtopicRows = cards.flatMap((c) =>
  uniq(c.subtopic_ids).map((subtopic_id) => ({ card_id: c.card_id, subtopic_id })),
);
const cardKeywordRows = cards.flatMap((c) =>
  uniq(c.keyword_ids).map((keyword_id) => ({ card_id: c.card_id, keyword_id })),
);

// --- Translations -------------------------------------------------------------
// Per (card, locale) keywords_text = each keyword's localized title + aliases,
// folded into the search vector for synonym/keyword matching.
const kwForms = (L, id) => {
  const e = L.keywords?.[id];
  if (!e) return [];
  if (typeof e === 'string') return [e];
  return [e.title, ...(e.aliases ?? [])].filter(Boolean);
};

const topicTrRows = [];
const subtopicTrRows = [];
const keywordTrRows = [];
const cardTrRows = [];
for (const locale of LOCALES) {
  const L = locales[locale];
  for (const [topic_id, v] of Object.entries(L.topics ?? {}))
    topicTrRows.push({ topic_id, locale, title: v.title ?? null, description: v.description ?? null });
  for (const id of subtopicIds)
    subtopicTrRows.push({ subtopic_id: id, locale, title: L.subtopics?.[id]?.title ?? null });
  for (const id of keywordIds) {
    const e = L.keywords?.[id];
    keywordTrRows.push({ keyword_id: id, locale, term: typeof e === 'string' ? e : e?.title ?? null });
  }

  const text = L.cards ?? {};
  for (const c of cards) {
    const kwText = [...new Set((c.keyword_ids ?? []).flatMap((id) => kwForms(L, id)))].join(' ');
    cardTrRows.push({
      card_id: c.card_id,
      locale,
      title: text[c.title_i18n_key] ?? null,
      short_body: text[c.short_body_i18n_key] ?? null,
      body: text[c.body_i18n_key] ?? null,
      search_text: c.search_i18n_key ? text[c.search_i18n_key] ?? null : null,
      keywords_text: kwText || null,
    });
  }
}

// --- Synonym / cross-lingual aliases (glossary + entity_index) ----------------
// Each group's surface forms expand to one another at query time.
const aliasSet = new Set(); // dedup on `${alias}\t${expansion}`
const aliasRows = [];
const addGroup = (forms, source) => {
  const uniq = [...new Set(forms.map((f) => (f ?? '').trim()).filter(Boolean))];
  if (uniq.length < 2) return; // nothing to expand to
  const expansion = uniq.join(' ');
  for (const f of uniq) {
    const alias = f.toLowerCase();
    const key = `${alias}\t${expansion}`;
    if (aliasSet.has(key)) continue;
    aliasSet.add(key);
    aliasRows.push({ alias, expansion, locale: null, source });
  }
};
// D: default to curated glossary terms only — auto-derived (origin='auto_keyword',
// needs_review) terms have broad aliases that dilute query precision. Flip to include them
// if recall matters more than precision.
const INCLUDE_AUTO_GLOSSARY = false;
for (const term of glossary.terms ?? []) {
  if (!INCLUDE_AUTO_GLOSSARY && term.origin === 'auto_keyword') continue;
  addGroup([term.canonical_term, ...(term.aliases ?? [])], 'glossary');
}
for (const ent of entityIndex.entities ?? []) addGroup([ent.name, ...(ent.aliases ?? [])], 'entity');

// --- Related context: glossary terms + entities (card-detail panel) -----------
// Locale-key transforms (verified): term.<slug> -> glossary.<slug>.title/.definition ;
// entity.<slug> -> entities.<slug>.name/.description (internal entities may lack a
// translation -> fall back to entity_index.name).
const slug = (id) => id.slice(id.indexOf('.') + 1);
const glossaryTerms = glossary.terms ?? [];
const entityList = entityIndex.entities ?? [];
const termSet = new Set(glossaryTerms.map((t) => t.term_id));
const entSet = new Set(entityList.map((e) => e.entity_id));

const glossaryRows = glossaryTerms.map((t) => ({
  term_id: t.term_id,
  origin: t.origin ?? null,
  status: t.status ?? null,
}));
const entityRows = entityList.map((e) => ({
  entity_id: e.entity_id,
  type: e.type ?? null,
  visibility: e.visibility ?? null,
  name: e.name ?? null,
}));

const glossaryTrRows = [];
const entityTrRows = [];
for (const locale of LOCALES) {
  const L = locales[locale];
  for (const t of glossaryTerms) {
    const base = `glossary.${slug(t.term_id)}`;
    glossaryTrRows.push({
      term_id: t.term_id,
      locale,
      term: L.glossary?.[`${base}.title`] ?? null,
      definition: L.glossary?.[`${base}.definition`] ?? null,
    });
  }
  for (const e of entityList) {
    const base = `entities.${slug(e.entity_id)}`;
    entityTrRows.push({
      entity_id: e.entity_id,
      locale,
      name: L.entities?.[`${base}.name`] ?? null,
      description: L.entities?.[`${base}.description`] ?? null,
    });
  }
}

const cardGlossaryRows = cards.flatMap((c) =>
  uniq(c.glossary_term_ids).filter((id) => termSet.has(id)).map((term_id) => ({ card_id: c.card_id, term_id })),
);
const cardEntityRows = cards.flatMap((c) =>
  uniq(c.entity_ids).filter((id) => entSet.has(id)).map((entity_id) => ({ card_id: c.card_id, entity_id })),
);

// --- Public resources: official orgs/sites with verified URLs (card panel) -----
// Only public resources are ingested (v6.3+); internal/unverified ones are skipped
// so they can never surface. Each resource carries explicit name/description i18n keys.
const publicResources = (resourcesFile.resources ?? []).filter((r) => r.visibility === 'public');
const resSet = new Set(publicResources.map((r) => r.resource_id));
const resourceRows = publicResources.map((r) => ({
  resource_id: r.resource_id,
  type: r.type ?? null,
  url: r.url ?? null,
  visibility: r.visibility ?? null,
}));
const resourceTrRows = [];
for (const locale of LOCALES) {
  const L = locales[locale];
  for (const r of publicResources) {
    resourceTrRows.push({
      resource_id: r.resource_id,
      locale,
      name: r.name_i18n_key ? L.resources?.[r.name_i18n_key] ?? null : null,
      description: r.description_i18n_key ? L.resources?.[r.description_i18n_key] ?? null : null,
    });
  }
}
const cardResourceRows = cards.flatMap((c) =>
  uniq(c.resource_ids).filter((id) => resSet.has(id)).map((resource_id) => ({ card_id: c.card_id, resource_id })),
);

const translationCount = topicTrRows.length + subtopicTrRows.length + keywordTrRows.length + cardTrRows.length;
const publicActive = cards.filter((c) => c.visibility === 'public' && c.status === 'active').length;

console.log(`Source hash: ${sourceHash.slice(0, 12)}…`);
console.log(
  `Built: ${topicRows.length} topics · ${cardRows.length} cards (${publicActive} public+active) · ` +
    `${subtopicRows.length} subtopics · ${keywordRows.length} keywords · ` +
    `${translationCount} translations · ${aliasRows.length} alias rows · ` +
    `${glossaryRows.length} glossary · ${entityRows.length} entities · ${resourceRows.length} resources · ` +
    `${cardGlossaryRows.length + cardEntityRows.length + cardResourceRows.length} card links`,
);

if (DRY_RUN) {
  console.log('Dry run — no database changes.');
  process.exit(0);
}

// --- Bulk insert helper ------------------------------------------------------
async function insertRows(client, table, columns, rows, chunk = 500) {
  for (let i = 0; i < rows.length; i += chunk) {
    const batch = rows.slice(i, i + chunk);
    const values = [];
    const tuples = batch.map((r, ri) => {
      const ph = columns.map((_, ci) => `$${ri * columns.length + ci + 1}`);
      columns.forEach((c) => values.push(r[c] ?? null));
      return `(${ph.join(',')})`;
    });
    await client.query(`insert into ${table} (${columns.join(',')}) values ${tuples.join(',')}`, values);
  }
}

// Children first, then parents. questions/question_translations reference cards,
// so they must be cleared before cards.
const DELETE_ORDER = [
  'question_translations', 'questions',
  'card_glossary_terms', 'card_entities', 'card_resources',
  'card_translations', 'card_keywords', 'card_subtopics', 'cards',
  'topic_translations', 'subtopic_translations', 'keyword_translations',
  'subtopics', 'keywords', 'topics', 'search_aliases',
  'glossary_translations', 'entity_translations', 'resource_translations',
  'glossary_terms', 'entities', 'resources',
];

// --- Deploy ------------------------------------------------------------------
const client = new pg.Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const t0 = process.hrtime.bigint();
await client.connect();
try {
  await client.query('begin');

  for (const table of DELETE_ORDER) await client.query(`delete from ${table}`);

  await insertRows(client, 'topics',
    ['topic_id', 'sensitivity', 'default_staleness_risk', 'clean_message_count'], topicRows);
  await insertRows(client, 'subtopics', ['subtopic_id', 'topic_id'], subtopicRows);
  await insertRows(client, 'keywords', ['keyword_id'], keywordRows);

  const cardCols = [
    'card_id', 'topic_id', 'card_type', 'content_category', 'status', 'visibility', 'confidence', 'staleness_risk',
    'needs_review', 'sensitivity_tags', 'sensitivity_level', 'quality_score', 'confidence_score',
    'alignment_score', 'last_confirmed_date', 'stale_after_days', 'requires_periodic_check', 'search_boost',
    'first_seen_message_date', 'last_updated_from_message_date', 'source_stats', 'version',
  ];
  await insertRows(client, 'cards', cardCols, cardRows);

  await insertRows(client, 'card_subtopics', ['card_id', 'subtopic_id'], cardSubtopicRows);
  await insertRows(client, 'card_keywords', ['card_id', 'keyword_id'], cardKeywordRows);

  await insertRows(client, 'topic_translations', ['topic_id', 'locale', 'title', 'description'], topicTrRows);
  await insertRows(client, 'subtopic_translations', ['subtopic_id', 'locale', 'title'], subtopicTrRows);
  await insertRows(client, 'keyword_translations', ['keyword_id', 'locale', 'term'], keywordTrRows);
  // search_vector is filled by the BEFORE INSERT trigger per locale.
  await insertRows(client, 'card_translations',
    ['card_id', 'locale', 'title', 'short_body', 'body', 'search_text', 'keywords_text'], cardTrRows);
  await insertRows(client, 'search_aliases', ['alias', 'expansion', 'locale', 'source'], aliasRows);

  // Related context (glossary terms + entities) — masters before card links.
  await insertRows(client, 'glossary_terms', ['term_id', 'origin', 'status'], glossaryRows);
  await insertRows(client, 'entities', ['entity_id', 'type', 'visibility', 'name'], entityRows);
  await insertRows(client, 'resources', ['resource_id', 'type', 'url', 'visibility'], resourceRows);
  await insertRows(client, 'glossary_translations', ['term_id', 'locale', 'term', 'definition'], glossaryTrRows);
  await insertRows(client, 'entity_translations', ['entity_id', 'locale', 'name', 'description'], entityTrRows);
  await insertRows(client, 'resource_translations', ['resource_id', 'locale', 'name', 'description'], resourceTrRows);
  await insertRows(client, 'card_glossary_terms', ['card_id', 'term_id'], cardGlossaryRows);
  await insertRows(client, 'card_entities', ['card_id', 'entity_id'], cardEntityRows);
  await insertRows(client, 'card_resources', ['card_id', 'resource_id'], cardResourceRows);

  // Normalized questions (reference answer-cards) + localized phrasings.
  await insertRows(client, 'questions',
    ['question_id', 'answer_card_id', 'topic_id', 'ask_frequency', 'status', 'visibility'], questionRows);
  await insertRows(client, 'question_translations', ['question_id', 'locale', 'phrasings'], questionTrRows);

  await client.query(
    `insert into kb_data_versions (version_label, source_hash, topic_count, card_count, translation_count, notes)
     values ($1,$2,$3,$4,$5,$6)`,
    [LABEL, sourceHash, topicRows.length, cardRows.length, translationCount, NOTES],
  );

  await client.query('commit');
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`\n✓ Deployed atomically in ${ms.toFixed(0)} ms.`);
  console.log(`  version_label: ${LABEL ?? '(none)'} · hash ${sourceHash.slice(0, 12)}…`);
} catch (e) {
  await client.query('rollback').catch(() => {});
  console.error('\n✗ Deploy failed — rolled back, live data unchanged.');
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
