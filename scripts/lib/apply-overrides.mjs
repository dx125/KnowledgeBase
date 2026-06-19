// =============================================================================
// Reproducible card-text override layer.
//
// We are the dataset team now: we own corrections (mainly proper EN/ES/DE
// translations the vendor build collapsed into generic per-category templates).
// Those corrections must SURVIVE a new raw-data drop, so they live in git under
// `dataset-patches/card-overrides.json` keyed by card_id, NOT edited into the raw
// vendor files. deploy.mjs calls applyCardOverrides() right after loading the raw
// locales; on every deploy the overrides are re-applied on top of whatever raw
// version DATASET_DIR points at.
//
// Override file shape (dataset-patches/card-overrides.json):
//   {
//     "card.real_estate_rent.advice.40": {
//       "ru_body_hash": "1d60b508",          // RU body md5(8) when authored (drift guard)
//       "en": { "title": "...", "short": "...", "body": "..." },
//       "es": { ... },
//       "de": { ... }
//     }
//   }
// Only en/es/de are overridden; RU is the editorial source of truth and untouched.
// search_text for an overridden card is re-derived from its translated
// title/short/body so per-language search keeps working without hand-written blobs.
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const OVERRIDE_LOCALES = ['en', 'es', 'de'];

export function md5h(s) {
  return createHash('md5').update((s ?? '').trim()).digest('hex').slice(0, 8);
}

// Mutates `locales` in place. Returns stats + any warnings (unknown cards, RU drift).
export function applyCardOverrides({ cards, locales, overridesPath, ruLocale = 'ru' }) {
  const stats = { applied: 0, cardsTouched: 0, unknown: [], drift: [], missingRu: [] };
  if (!existsSync(overridesPath)) return stats;

  const overrides = JSON.parse(readFileSync(overridesPath, 'utf-8'));
  const byId = new Map(cards.map((c) => [c.card_id, c]));
  const ruCards = locales[ruLocale]?.cards ?? {};

  for (const [cardId, entry] of Object.entries(overrides)) {
    const c = byId.get(cardId);
    if (!c) {
      stats.unknown.push(cardId);
      continue;
    }
    // Drift guard: if the RU source body changed since we authored the translation,
    // flag it — the translation may now be stale and should be re-reviewed.
    if (entry.ru_body_hash && c.body_i18n_key) {
      const cur = md5h(ruCards[c.body_i18n_key]);
      if (cur !== entry.ru_body_hash) stats.drift.push({ cardId, was: entry.ru_body_hash, now: cur });
    }
    let touched = false;
    for (const locale of OVERRIDE_LOCALES) {
      const fields = entry[locale];
      if (!fields) continue;
      const L = (locales[locale] = locales[locale] ?? {});
      L.cards = L.cards ?? {};
      if (fields.title != null && c.title_i18n_key) L.cards[c.title_i18n_key] = fields.title;
      if (fields.short != null && c.short_body_i18n_key) L.cards[c.short_body_i18n_key] = fields.short;
      if (fields.body != null && c.body_i18n_key) L.cards[c.body_i18n_key] = fields.body;
      // Re-derive search_text from the (now translated) fields.
      if (c.search_i18n_key) {
        const parts = [
          c.title_i18n_key && L.cards[c.title_i18n_key],
          c.short_body_i18n_key && L.cards[c.short_body_i18n_key],
          c.body_i18n_key && L.cards[c.body_i18n_key],
        ].filter(Boolean);
        if (parts.length) L.cards[c.search_i18n_key] = parts.join(' \n ');
      }
      stats.applied++;
      touched = true;
    }
    if (touched) stats.cardsTouched++;
  }
  return stats;
}
