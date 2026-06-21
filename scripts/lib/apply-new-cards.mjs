// =============================================================================
// Reproducible NEW-CARD layer (companion to apply-overrides.mjs).
//
// The override layer corrects EN/ES/DE for cards that already exist in the raw
// vendor dataset. This layer ADDS cards the vendor build never produced —
// editorial cards we author from the source chat evidence to close content gaps
// (e.g. tax-residency / the foreign-income "tax holiday", which 0 of the 21
// taxes cards covered). Like the override layer, these live in git
// (`dataset-patches/new-cards.json`) and are re-applied on every deploy, so they
// survive a new raw-data drop. RU is authored as the editorial source of truth;
// EN/ES/DE are authored alongside it.
//
// Authoring shape (dataset-patches/new-cards.json) — one entry per card:
//   {
//     "card_id": "card.taxes_accounting_empresa.reference.ref_nalogovoe_rezidentstvo",
//     "topic_id": "topic.taxes_accounting_empresa",
//     "content_category": "reference",       // advice|checklist|warning|reference|overview|instruction
//     "card_type": "summary",                // summary|how_to|public_overview
//     "visibility": "public", "status": "active",
//     "subtopic_ids": [...], "keyword_ids": [...], "glossary_term_ids": [...],
//     "entity_ids": [...], "resource_ids": [...], "related_card_ids": [...],
//     "needs_review": true, "staleness_risk": "high", "sensitivity_tags": ["financial"],
//     "text": {
//       "ru": { "title": "...", "short": "...", "body": "..." },
//       "en": { ... }, "es": { ... }, "de": { ... }
//     }
//   }
//
// The four i18n keys are DERIVED from card_id (card.X -> cards.X.{title,short,
// body,search}); search_text is derived from title+short+body so per-language
// FTS works. Link ids (glossary/entity/resource) that don't resolve to a master
// are silently dropped by deploy, so reusing existing ids is FK-safe.
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';

const LOCALES = ['ru', 'en', 'es', 'de'];

// card.<rest>  ->  cards.<rest>
const keyBase = (cardId) => 'cards.' + cardId.replace(/^card\./, '');

export function applyNewCards({ cards, locales, newCardsPath, today = new Date().toISOString() }) {
  const stats = { added: 0, dupes: [], ids: [] };
  if (!existsSync(newCardsPath)) return stats;

  const entries = JSON.parse(readFileSync(newCardsPath, 'utf-8'));
  const existing = new Set(cards.map((c) => c.card_id));

  for (const e of entries) {
    const id = e.card_id;
    if (existing.has(id)) { stats.dupes.push(id); continue; } // never clobber a real card
    existing.add(id);

    const base = keyBase(id);
    const card = {
      card_id: id,
      topic_id: e.topic_id,
      card_type: e.card_type ?? 'summary',
      content_category: e.content_category ?? null,
      subtopic_ids: e.subtopic_ids ?? [],
      keyword_ids: e.keyword_ids ?? [],
      negative_keyword_ids: [],
      title_i18n_key: `${base}.title`,
      short_body_i18n_key: `${base}.short`,
      body_i18n_key: `${base}.body`,
      search_i18n_key: `${base}.search`,
      summary_i18n_key: `${base}.short`,
      related_card_ids: e.related_card_ids ?? [],
      prerequisite_card_ids: e.prerequisite_card_ids ?? [],
      see_also_card_ids: [],
      resource_ids: e.resource_ids ?? [],
      glossary_term_ids: e.glossary_term_ids ?? [],
      entity_ids: e.entity_ids ?? [],
      question_ids: [],
      status: e.status ?? 'active',
      visibility: e.visibility ?? 'public',
      confidence: e.confidence ?? 'medium',
      confidence_score: e.confidence_score ?? 0.6,
      staleness_risk: e.staleness_risk ?? 'high',
      needs_review: e.needs_review ?? true,
      review_reasons: e.review_reasons ?? ['financial_topic_verify_before_action', 'editorially_authored_card'],
      sensitivity_tags: e.sensitivity_tags ?? [],
      sensitivity_level: e.sensitivity_level ?? null,
      first_seen_message_date: e.first_seen_message_date ?? null,
      last_updated_from_message_date: e.last_updated_from_message_date ?? today,
      source_stats: e.source_stats ?? null,
      semantic_alignment: { alignment_score: e.alignment_score ?? null },
      alignment_score: e.alignment_score ?? null,
      validity: {
        valid_from: null,
        valid_until: null,
        last_confirmed_date: e.last_confirmed_date ?? null,
        stale_after_days: e.stale_after_days ?? 90,
        requires_periodic_check: true,
      },
      quality: { score: e.quality_score ?? 0.6 },
      search_boost: e.search_boost ?? 0,
      version: e.version ?? 'dataset-patch',
      provenance: 'dataset-patches/new-cards.json',
    };
    // Optional structured metadata block (e.g. per-district safety/infra/price
    // ratings + tags) carried verbatim onto the card for downstream use. The
    // same facts are also folded into the card body so they reach search_text.
    if (e.district_meta) card.district_meta = e.district_meta;
    cards.push(card);

    for (const loc of LOCALES) {
      const t = e.text?.[loc];
      if (!t) continue;
      const L = (locales[loc] = locales[loc] ?? {});
      L.cards = L.cards ?? {};
      L.cards[`${base}.title`] = t.title ?? null;
      L.cards[`${base}.short`] = t.short ?? null;
      L.cards[`${base}.body`] = t.body ?? null;
      const parts = [t.title, t.short, t.body].filter(Boolean);
      if (parts.length) L.cards[`${base}.search`] = parts.join(' \n ');
    }
    stats.added++;
    stats.ids.push(id);
  }
  return stats;
}
