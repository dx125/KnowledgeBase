// =============================================================================
// Coverage + drift report for the override layer.
//
//   node scripts/check-overrides.mjs
//
// Reports, against DATASET_DIR + dataset-patches/card-overrides.json:
//   • collapse: cards whose EN body is still shared with another card (untranslated)
//   • coverage: how many cards have an override
//   • drift:    cards whose RU source body changed since the translation was authored
//   • unknown:  overrides pointing at card_ids not in kb_cards.json
// Exit code is non-zero if drift or unknown cards are found (CI-friendly).
// =============================================================================
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { md5h, applyCardOverrides } from './lib/apply-overrides.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(HERE, '..', '.env') });
const { DATASET_DIR } = process.env;
if (!DATASET_DIR) {
  console.error('Missing DATASET_DIR in .env');
  process.exit(1);
}

const LOCALES = ['ru', 'en', 'es', 'de'];
const cards = JSON.parse(readFileSync(join(DATASET_DIR, 'kb_cards.json'), 'utf-8')).cards;
const locales = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(join(DATASET_DIR, `locale_${l}.json`), 'utf-8'))]),
);
const OVERRIDES_PATH = join(HERE, '..', 'dataset-patches', 'card-overrides.json');
const overrides = existsSync(OVERRIDES_PATH) ? JSON.parse(readFileSync(OVERRIDES_PATH, 'utf-8')) : {};

// Apply overrides (mutates locales) and capture drift/unknown.
const stats = applyCardOverrides({ cards, locales, overridesPath: OVERRIDES_PATH });

// Collapse: post-override, how many cards still share an EN body with another card.
const collapseReport = (loc) => {
  const cnt = {};
  for (const c of cards) {
    const h = md5h(locales[loc].cards?.[c.body_i18n_key]);
    cnt[h] = (cnt[h] || 0) + 1;
  }
  let shared = 0;
  for (const c of cards) if (cnt[md5h(locales[loc].cards?.[c.body_i18n_key])] > 1) shared++;
  return shared;
};

console.log(`Cards: ${cards.length}`);
console.log(`Overrides: ${Object.keys(overrides).length} card(s) (${stats.cardsTouched} applied)`);
for (const loc of ['en', 'es', 'de'])
  console.log(`Still-collapsed ${loc} bodies (shared with another card): ${collapseReport(loc)}`);
if (stats.unknown.length) console.log(`\n⚠ unknown card_ids in overrides (${stats.unknown.length}):\n  ${stats.unknown.join('\n  ')}`);
if (stats.drift.length)
  console.log(`\n⚠ RU source drift since authoring (${stats.drift.length}):\n  ${stats.drift.map((d) => `${d.cardId} ${d.was}->${d.now}`).join('\n  ')}`);
if (!stats.unknown.length && !stats.drift.length) console.log('\n✓ no unknown cards, no RU drift.');

process.exit(stats.unknown.length || stats.drift.length ? 1 : 0);
