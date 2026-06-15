// Quick DB-level smoke test of the deployed schema, data and RPCs.
//   node smoke.mjs
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(HERE, '..', '.env') });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  const ver = await client.query('select * from current_data_version()');
  console.log('data version:', ver.rows[0]?.version_label, '· cards', ver.rows[0]?.card_count);

  const topics = await client.query("select count(*)::int n from list_topics('ru', false)");
  console.log('list_topics(ru, public):', topics.rows[0].n, 'topics');

  const s = await client.query("select card_id, title, round(rank::numeric,3) rank from search_cards('cedula', 'ru', null, 5, 0, false)");
  console.log('search_cards("cedula", ru): top results');
  for (const r of s.rows) console.log('  ', r.rank, r.card_id, '—', (r.title ?? '').slice(0, 50));

  const cardId = s.rows[0]?.card_id ?? 'card.summary.bank_accounts_cards';
  const card = await client.query('select get_card($1, $2) as c', [cardId, 'ru']);
  const c = card.rows[0].c;
  console.log('get_card', cardId, '→ glossary:', (c.glossary ?? []).length, 'entities:', (c.entities ?? []).length);

  // raw-id leak guard (should be 0)
  const leak = await client.query(`
    select count(*)::int n from card_translations ct join cards c on c.card_id=ct.card_id
    where c.visibility='public' and c.status='active'
      and ct.body ~ '\\m(entity|term|kw|topic|subtopic|resource)\\.[a-z0-9_]+'`);
  console.log('public bodies with raw IDs (want 0):', leak.rows[0].n);
} finally {
  await client.end();
}
