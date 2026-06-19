// =============================================================================
// Materialize a new raw dataset version by FOLDING our git-owned card-text
// corrections (dataset-patches/card-overrides.json) into a copy of a raw
// dataset. This is the "dataset team ships the fix in the source build" step:
// the EN/ES/DE card translations the override layer applies at deploy time are
// baked directly into locale_en/es/de.json, producing a self-contained,
// versioned folder. Once a downstream points DATASET_DIR at the new version,
// the override layer becomes a no-op (it re-applies identical text) and can
// eventually retire.
//
//   node scripts/build-dataset-version.mjs \
//     --dest "C:/Users/alezd/Downloads/kb_dataset_uy_v6_6" \
//     --version 6.6.0-decollapsed
//
//   # --src defaults to DATASET_DIR from .env
//
// What it does
//   • copies every file from --src to --dest verbatim, EXCEPT the three non-RU
//     locale files and DATASET_MANIFEST.json (regenerated below);
//   • applies card-overrides.json to en/es/de (title/short/body + re-derived
//     search blob) using the SAME applyCardOverrides() deploy uses, so the
//     baked text is byte-identical to what a deploy would produce;
//   • refreshes each rewritten locale's meta block;
//   • writes a V6_6 patch doc;
//   • regenerates DATASET_MANIFEST.json (new version, sizes, sha256).
//
// RU is the editorial source of truth and is copied unchanged.
// =============================================================================
import {
  readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync,
} from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { applyCardOverrides } from './lib/apply-overrides.mjs';
import { applyNewCards } from './lib/apply-new-cards.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(HERE, '..', '.env') });

// --- args --------------------------------------------------------------------
const args = process.argv.slice(2);
const getArg = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const SRC = getArg('src') ?? process.env.DATASET_DIR;
const DEST = getArg('dest');
const VERSION = getArg('version');
if (!SRC || !DEST || !VERSION) {
  console.error('Usage: node scripts/build-dataset-version.mjs --dest <dir> --version <x.y.z> [--src <dir>]');
  console.error('  --src defaults to DATASET_DIR from .env');
  process.exit(1);
}

const LOCALES = ['ru', 'en', 'es', 'de'];
// Files we write fresh rather than copy: the three non-RU locales (override text),
// plus kb_cards.json + locale_ru.json (new cards add RU text + card metadata), plus the manifest.
const REGENERATED = new Set([
  'locale_en.json', 'locale_es.json', 'locale_de.json',
  'kb_cards.json', 'locale_ru.json', 'DATASET_MANIFEST.json',
]);
const NOW = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

// --- 1. apply overrides + new cards (in memory) ------------------------------
const kb = JSON.parse(readFileSync(join(SRC, 'kb_cards.json'), 'utf-8'));
const cards = kb.cards; // same array reference — mutating `cards` updates `kb`
const locales = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(join(SRC, `locale_${l}.json`), 'utf-8'))]),
);
const OVERRIDES_PATH = join(HERE, '..', 'dataset-patches', 'card-overrides.json');
const ov = applyCardOverrides({ cards, locales, overridesPath: OVERRIDES_PATH });
if (ov.unknown.length) {
  console.error(`✗ ${ov.unknown.length} override(s) point at unknown card_ids — aborting (fix overrides first):`);
  console.error('  ' + ov.unknown.join('\n  '));
  process.exit(1);
}
if (ov.drift.length) {
  console.error(`✗ RU source drifted for ${ov.drift.length} card(s) since translation — aborting (re-review first):`);
  console.error('  ' + ov.drift.map((d) => `${d.cardId} ${d.was}->${d.now}`).join('\n  '));
  process.exit(1);
}
console.log(`Overrides folded into en/es/de: ${ov.cardsTouched} cards (${ov.applied} locale-fields).`);

const NEW_CARDS_PATH = join(HERE, '..', 'dataset-patches', 'new-cards.json');
const nc = applyNewCards({ cards, locales, newCardsPath: NEW_CARDS_PATH });
if (nc.dupes.length) {
  console.error(`✗ new-cards collide with existing card_id(s) — aborting: ${nc.dupes.join(', ')}`);
  process.exit(1);
}
if (nc.added) console.log(`New cards folded into kb_cards + all locales: ${nc.added} (${nc.ids.length} ids).`);

// Refresh the meta block of each rewritten locale so the file documents itself.
const cardCount = cards.length;
for (const l of LOCALES) {
  const m = (locales[l].meta = locales[l].meta ?? {});
  m.schema_version = VERSION;
  m.updated_at = NOW;
  if (l !== 'ru') m.translation_quality = 'reader_ready_decollapsed_from_ru';
  m.notes =
    `v6.6: per-card EN/ES/DE card text (title/short/body/search) rebuilt from the Russian ` +
    `editorial source, replacing the v6.5 per-category collapsed templates; all cards mutually ` +
    `distinct per locale. Plus ${nc.added} editorially-authored card(s) closing source-evidence ` +
    `gaps (tax residency / foreign-income tax holiday). ${cardCount} cards total. RU remains the ` +
    `editorial source of truth.`;
}

// --- 2. copy the source tree (minus regenerated files) -----------------------
mkdirSync(DEST, { recursive: true });
let copied = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const st = statSync(abs);
    const rel = relative(SRC, abs);
    if (st.isDirectory()) { mkdirSync(join(DEST, rel), { recursive: true }); walk(abs); continue; }
    if (REGENERATED.has(rel.split(sep).join('/'))) continue; // top-level regenerated files
    copyFileSync(abs, join(DEST, rel));
    copied++;
  }
};
walk(SRC);

// --- 3. write the regenerated content files ----------------------------------
// kb_cards.json (new cards appended) + all four locales (RU gains new-card text;
// en/es/de gain overrides + new-card text).
writeFileSync(join(DEST, 'kb_cards.json'), JSON.stringify(kb, null, 1) + '\n', 'utf-8');
for (const l of LOCALES)
  writeFileSync(join(DEST, `locale_${l}.json`), JSON.stringify(locales[l], null, 2) + '\n', 'utf-8');

// --- 4. version patch doc ----------------------------------------------------
const patchName = 'V6_6_DECOLLAPSE_LOCALIZATION_PATCH.md';
writeFileSync(join(DEST, patchName), `# V6.6 de-collapse localization patch

Authored against \`${relative(dirname(SRC), SRC).split(sep).join('/') || SRC}\` (v6.5.2-localized-quality).

## What changed

v6.5 cleared its no-Cyrillic localization gate by substituting **one generic template per
content-category** for the EN/ES/DE card text, so 192 of 265 cards shared a collapsed body
(\`title\`/\`short\`/\`body\`) while the Russian source kept every card distinct. Cards looked
duplicated by header and content (e.g. every \`reference\` card read *"reference: reference note"*).

v6.6 replaces that collapsed text with **per-card EN/ES/DE translations rebuilt from the Russian
editorial source** for all 265 base cards:

- \`cards.<id>.title\`, \`.short\`, \`.body\` — faithful translations of the RU card, structure
  preserved (numbered lists, checklists, paragraph breaks).
- \`cards.<id>.search\` — re-derived per card from the translated title + short + body so
  per-language full-text search works.

Uruguay-specific loanwords and proper nouns are preserved verbatim (cédula, gastos comunes,
escribano, contador, DGI, BPS, Fonasa, UTE, OSE, Antel, BROU, empresa, unipersonal, monotributo,
SAS, …). Russian remains the editorial source of truth.

## New editorial cards (content-gap closure)

v6.6 also **adds ${nc.added} editorially-authored card(s)** (RU + EN/ES/DE) that the vendor build
never produced, closing a gap found by reviewing the source evidence (claims / clean_messages)
against the published cards: tax residency and the foreign-income **tax holiday** for new residents
were discussed by the community but covered by 0 of the 21 taxes cards. New \`card_id\`s:
${nc.ids.map((i) => '`' + i + '`').join(', ') || '(none)'}. Quantitative claims are marked
\`needs_review\` / \`staleness_risk: high\` and hedged ("verify with a contador / DGI").

## Result

| | RU | EN | ES | DE |
|---|---|---|---|---|
| distinct card bodies | ${cardCount} | ${cardCount} | ${cardCount} | ${cardCount} |
| cards sharing a body with another | 0 | 0 | 0 | 0 |

0 Cyrillic in EN/ES/DE card fields (outside the loanword whitelist); no \`en\`==\`es\`==\`de\`
collapse; no card equals its RU source. No cards were deleted — the apparent duplication in v6.5
was a translation artifact, not real duplication. Card count rose from 265 to ${cardCount} via the
new editorial cards above.

## Provenance / reproducibility

Built by \`scripts/build-dataset-version.mjs\` in the KnowledgeBase repo, which folds the
git-tracked corrections in \`dataset-patches/card-overrides.json\` (EN/ES/DE fixes) and
\`dataset-patches/new-cards.json\` (added cards) onto the v6.5 raw dataset. Each override carries an
\`md5(RU body)[:8]\` drift guard; the build aborts on drift, unknown card_ids, or new-card id
collisions. See the repo's \`docs/DATASET_DUPLICATION_REPORT.md\`.

## Not regenerated in this version

\`search_indexes/*.jsonl\`, \`search_dictionary.json\`, \`questions.json\` and \`candidate_cards.json\`
are carried over unchanged from v6.5 (the downstream app builds its search from
\`locale_*.json\` card text at deploy time, not from these vendor artifacts). They remain valid
for RU; their EN/ES/DE entries still reflect the v6.5 collapsed text.

Generated at: ${NOW}
`, 'utf-8');

// --- 5. regenerate DATASET_MANIFEST.json -------------------------------------
// Walk the finished DEST tree and hash every file except the manifest itself
// (a manifest cannot hash itself). Paths are posix-relative, sorted.
const files = [];
const collect = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    const st = statSync(abs);
    if (st.isDirectory()) { collect(abs); continue; }
    const rel = relative(DEST, abs).split(sep).join('/');
    if (rel === 'DATASET_MANIFEST.json') continue;
    files.push({
      path: rel,
      size_bytes: st.size,
      sha256: createHash('sha256').update(readFileSync(abs)).digest('hex'),
    });
  }
};
collect(DEST);
files.sort((a, b) => a.path.localeCompare(b.path));

const manifest = {
  dataset: 'kb_dataset_uy',
  version: VERSION,
  generated_at: NOW,
  derived_from: '6.5.2-localized-quality',
  built_by: 'KnowledgeBase/scripts/build-dataset-version.mjs (folds dataset-patches/card-overrides.json)',
  manifest_self_excluded: true,
  file_count: files.length,
  files,
};
writeFileSync(join(DEST, 'DATASET_MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

console.log(`\n✓ Built dataset ${VERSION}`);
console.log(`  dest:    ${DEST}`);
console.log(`  copied:  ${copied} files verbatim · rewrote 3 locales · +1 patch doc · manifest (${files.length} files)`);
