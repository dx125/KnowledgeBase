// =============================================================================
// Authoring helper: merge a translation batch into dataset-patches/card-overrides.json
//
//   node scripts/merge-overrides.mjs <batch.json>
//
// Batch shape (card-centric, all locales together — easiest to author):
//   {
//     "card.real_estate_rent.advice.advice": {
//       "en": { "title": "...", "short": "...", "body": "..." },
//       "es": { ... },
//       "de": { ... }
//     }
//   }
// For each card the RU body hash is read from DATASET_DIR and stored as ru_body_hash
// (drift guard). Cards not present in kb_cards.json are rejected. Entries are written
// back sorted by card_id for stable diffs.
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { md5h, OVERRIDE_LOCALES } from './lib/apply-overrides.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(HERE, '..', '.env') });

const batchPath = process.argv[2];
if (!batchPath) {
  console.error('Usage: node scripts/merge-overrides.mjs <batch.json>');
  process.exit(1);
}
const { DATASET_DIR } = process.env;
if (!DATASET_DIR) {
  console.error('Missing DATASET_DIR in .env');
  process.exit(1);
}

const cards = JSON.parse(readFileSync(join(DATASET_DIR, 'kb_cards.json'), 'utf-8')).cards;
const ruCards = JSON.parse(readFileSync(join(DATASET_DIR, 'locale_ru.json'), 'utf-8')).cards;
const byId = new Map(cards.map((c) => [c.card_id, c]));

const OUT = join(HERE, '..', 'dataset-patches', 'card-overrides.json');
const current = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf-8')) : {};
const batch = JSON.parse(readFileSync(batchPath, 'utf-8'));

let added = 0;
const errors = [];
for (const [cardId, entry] of Object.entries(batch)) {
  const c = byId.get(cardId);
  if (!c) {
    errors.push(`unknown card: ${cardId}`);
    continue;
  }
  const merged = { ru_body_hash: c.body_i18n_key ? md5h(ruCards[c.body_i18n_key]) : null };
  for (const loc of OVERRIDE_LOCALES) {
    if (!entry[loc]) continue;
    const { title, short, body } = entry[loc];
    if (title == null && short == null && body == null) continue;
    merged[loc] = {};
    if (title != null) merged[loc].title = title;
    if (short != null) merged[loc].short = short;
    if (body != null) merged[loc].body = body;
  }
  current[cardId] = merged;
  added++;
}

if (errors.length) {
  console.error('Refusing to merge — fix these first:\n  ' + errors.join('\n  '));
  process.exit(1);
}

const sorted = Object.fromEntries(Object.keys(current).sort().map((k) => [k, current[k]]));
writeFileSync(OUT, JSON.stringify(sorted, null, 2) + '\n');
console.log(`Merged ${added} card(s). card-overrides.json now covers ${Object.keys(sorted).length} card(s).`);
