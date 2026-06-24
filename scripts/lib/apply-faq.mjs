// =============================================================================
// Reproducible Q&A (FAQ) layer (companion to apply-overrides.mjs / apply-new-cards.mjs).
//
// This layer adds a self-contained Q&A section: dedicated FAQ TOPICS
// (topic.faq_*) that don't exist in the raw vendor taxonomy, plus one card per
// question. Each question becomes a normal card with content_category='faq' and
// card_type='faq' — the QUESTION is the title, a one-line answer the short_body,
// and the full answer the body. Because FAQ topics are first-class topics, the
// existing API already supports everything the Q&A view needs:
//   * load one Q&A topic  -> GET /topics/topic.faq_<x>/cards
//   * search within it     -> GET /search?topic=topic.faq_<x>
//   * keyword/plain-text   -> GET /search?q=...   (FAQ cards are topic.faq_*)
//
// Like the other patch layers it lives in git (dataset-patches/faq.json) and is
// re-applied on every deploy, so it survives a new raw-data drop. RU is authored
// as the editorial source of truth; EN/ES/DE are authored alongside.
//
// It mutates the in-memory dataset the SAME way deploy.mjs already consumes it:
//   * topics  -> pushed into kb.taxonomies.topics  (deploy builds topicRows from it)
//               + locales[loc].topics[id] = {title, description}  (topicTrRows)
//   * cards   -> pushed into `cards` with the four i18n keys derived from card_id
//               (cards.X.{title,short,body,search}); search_text = title+short+body
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';

const LOCALES = ['ru', 'en', 'es', 'de'];

// card.<rest>  ->  cards.<rest>
const keyBase = (cardId) => 'cards.' + cardId.replace(/^card\./, '');

export function applyFaq({ kb, cards, locales, faqPath, today = new Date().toISOString() }) {
  const stats = { topics: 0, questions: 0, dupeTopics: [], dupeCards: [] };
  if (!existsSync(faqPath)) return stats;

  const data = JSON.parse(readFileSync(faqPath, 'utf-8'));

  // --- 1. Register FAQ topics --------------------------------------------------
  kb.taxonomies = kb.taxonomies ?? {};
  kb.taxonomies.topics = kb.taxonomies.topics ?? [];
  const existingTopics = new Set(kb.taxonomies.topics.map((t) => t.topic_id));

  for (const t of data.topics ?? []) {
    if (existingTopics.has(t.topic_id)) { stats.dupeTopics.push(t.topic_id); continue; }
    existingTopics.add(t.topic_id);
    kb.taxonomies.topics.push({
      topic_id: t.topic_id,
      sensitivity: t.sensitivity ?? null,
      default_staleness_risk: t.default_staleness_risk ?? null,
    });
    for (const loc of LOCALES) {
      const tx = t.text?.[loc];
      if (!tx) continue;
      const L = (locales[loc] = locales[loc] ?? {});
      L.topics = L.topics ?? {};
      L.topics[t.topic_id] = { title: tx.title ?? null, description: tx.description ?? null };
    }
    stats.topics++;
  }

  // --- 2. Append one card per question ----------------------------------------
  const existingCards = new Set(cards.map((c) => c.card_id));
  for (const q of data.questions ?? []) {
    const id = q.card_id;
    if (existingCards.has(id)) { stats.dupeCards.push(id); continue; }
    existingCards.add(id);

    const base = keyBase(id);
    cards.push({
      card_id: id,
      topic_id: q.topic_id,
      card_type: 'faq',
      content_category: 'faq',
      subtopic_ids: [],
      keyword_ids: q.keyword_ids ?? [],
      negative_keyword_ids: [],
      title_i18n_key: `${base}.title`,
      short_body_i18n_key: `${base}.short`,
      body_i18n_key: `${base}.body`,
      search_i18n_key: `${base}.search`,
      summary_i18n_key: `${base}.short`,
      related_card_ids: q.related_card_ids ?? [],
      prerequisite_card_ids: [],
      see_also_card_ids: [],
      resource_ids: [],
      glossary_term_ids: [],
      entity_ids: [],
      question_ids: [],
      status: q.status ?? 'active',
      visibility: q.visibility ?? 'public',
      confidence: q.confidence ?? 'medium',
      confidence_score: q.confidence_score ?? 0.6,
      staleness_risk: q.staleness_risk ?? 'medium',
      needs_review: q.needs_review ?? true,
      review_reasons: q.review_reasons ?? ['editorially_authored_card', 'community_sourced_verify_before_action'],
      sensitivity_tags: q.sensitivity_tags ?? [],
      sensitivity_level: q.sensitivity_level ?? null,
      first_seen_message_date: null,
      last_updated_from_message_date: q.last_updated_from_message_date ?? today,
      source_stats: q.ask_signal ? { faq_ask_signal: q.ask_signal } : null,
      semantic_alignment: { alignment_score: q.alignment_score ?? null },
      alignment_score: q.alignment_score ?? null,
      validity: {
        valid_from: null,
        valid_until: null,
        last_confirmed_date: null,
        stale_after_days: q.stale_after_days ?? 120,
        requires_periodic_check: true,
      },
      quality: { score: q.quality_score ?? 0.6 },
      // Light boost so a strongly-asked FAQ ranks a touch higher in its topic.
      search_boost: q.search_boost ?? 0,
      version: 'dataset-patch-faq',
      provenance: 'dataset-patches/faq.json',
    });

    for (const loc of LOCALES) {
      const t = q.text?.[loc];
      if (!t) continue;
      const L = (locales[loc] = locales[loc] ?? {});
      L.cards = L.cards ?? {};
      L.cards[`${base}.title`] = t.title ?? null;
      L.cards[`${base}.short`] = t.short ?? null;
      L.cards[`${base}.body`] = t.body ?? null;
      const parts = [t.title, t.short, t.body].filter(Boolean);
      if (parts.length) L.cards[`${base}.search`] = parts.join(' \n ');
    }
    stats.questions++;
  }

  return stats;
}
