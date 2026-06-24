// =============================================================================
// Regenerate dataset/MANIFEST.json — the machine-readable description of the
// resulting dataset: which raw version it derives from, the patch layers (with
// content hashes + counts), the schema migrations, and the build pipeline.
//
//   node build-manifest.mjs
//
// Together with dataset/SCHEMA.md, dataset/CHANGELOG.md and dataset/PROVENANCE.md
// this lets the dataset be rebuilt from scratch: raw vendor dataset (DATASET_DIR)
// + the committed patch layers, replayed by scripts/deploy.mjs.
// =============================================================================
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { config as loadEnv } from 'dotenv';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
loadEnv({ path: join(ROOT, '.env') });

const sha = (s) => createHash('sha256').update(s).digest('hex');
const readJson = (p) => JSON.parse(readFileSync(p, 'utf-8'));
const rel = (p) => p.replace(ROOT + '\\', '').replace(ROOT + '/', '').replaceAll('\\', '/');

function layer(file, count) {
  const p = join(ROOT, file);
  if (!existsSync(p)) return { file, present: false };
  const raw = readFileSync(p, 'utf-8');
  return { file, present: true, sha256: sha(raw), ...count(JSON.parse(raw)) };
}

const RAW_DIR = process.env.DATASET_DIR;
let raw = { dir_env: 'DATASET_DIR', present: false };
if (RAW_DIR && existsSync(RAW_DIR)) {
  const man = existsSync(join(RAW_DIR, 'DATASET_MANIFEST.json')) ? readJson(join(RAW_DIR, 'DATASET_MANIFEST.json')) : {};
  const kb = existsSync(join(RAW_DIR, 'kb_cards.json')) ? readJson(join(RAW_DIR, 'kb_cards.json')) : { cards: [] };
  const batches = existsSync(join(RAW_DIR, 'import_batches.json')) ? readJson(join(RAW_DIR, 'import_batches.json')) : null;
  raw = {
    dir_env: 'DATASET_DIR',
    present: true,
    dataset: man.dataset ?? 'kb_dataset_uy',
    version: man.version ?? null,
    derived_from: man.derived_from ?? null,
    base_card_count: (kb.cards ?? []).length,
    import_batches: batches?.batches ?? null,
  };
}

const migrationsDir = join(ROOT, 'supabase', 'migrations');
const migrations = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => ({ file: 'supabase/migrations/' + f, sha256: sha(readFileSync(join(migrationsDir, f), 'utf-8')) }));

const manifest = {
  dataset: 'kb_dataset_uy',
  description:
    'Uruguay relocation knowledge base. Resulting dataset = a read-only raw vendor dataset (DATASET_DIR) ' +
    'replayed through git-owned patch layers by scripts/deploy.mjs into Supabase Postgres. RU is the editorial ' +
    'source of truth; EN/ES/DE are authored alongside.',
  generated_at: new Date().toISOString(),
  built_by: 'scripts/deploy.mjs (raw + patch layers -> atomic full-replace into Postgres)',
  manifest_generated_by: 'scripts/build-manifest.mjs',
  pipeline: [
    'raw vendor dataset (claims/clean_messages -> cards -> locales), read-only',
    'card-overrides.json  (EN/ES/DE corrections of collapsed vendor text; optional RU formatting)',
    'new-cards.json       (editorial cards the vendor never produced: tax, places, city overviews)',
    'faq.json             (Q&A answer-cards in dedicated topic.faq_* topics)',
    'questions.json       (questions referencing answer-cards + ask_frequency; no duplicated answers)',
    'deploy.mjs           (build rows, atomic transaction full-replace, kb_data_versions row)',
  ],
  raw_source: raw,
  patch_layers: [
    layer('dataset-patches/card-overrides.json', (j) => ({ entries: Object.keys(j).length, kind: 'card_overrides' })),
    layer('dataset-patches/new-cards.json', (j) => ({ entries: j.length, kind: 'new_cards' })),
    layer('dataset-patches/faq.json', (j) => ({ topics: j.topics.length, answer_cards: j.questions.length, kind: 'faq' })),
    layer('dataset-patches/questions.json', (j) => ({ questions: j.count ?? j.questions.length, kind: 'questions' })),
  ],
  schema_migrations: migrations,
  service_metadata:
    'Each editorial card/topic carries a `service` block (source_intent + kind + evidence) describing what it ' +
    'answers / how to regenerate it. Vendor cards derive from the raw claims/clean_messages evidence layer.',
  notes:
    'See dataset/README.md (pipeline + recreate), dataset/SCHEMA.md (full schema), dataset/CHANGELOG.md ' +
    '(upstream + our history), dataset/PROVENANCE.md (rationale, mistakes, lessons).',
};

const outDir = join(ROOT, 'dataset');
writeFileSync(join(outDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
console.log('Wrote dataset/MANIFEST.json');
console.log('  raw:', raw.version ?? '(raw dir not found)', '· base cards:', raw.base_card_count ?? '?');
for (const l of manifest.patch_layers) console.log('  layer:', l.file, l.present ? JSON.stringify({ ...l, sha256: l.sha256?.slice(0, 8) }) : '(absent)');
console.log('  migrations:', migrations.length);
