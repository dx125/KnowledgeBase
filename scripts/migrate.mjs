// =============================================================================
// Apply supabase/migrations/*.sql to the database, in filename order.
//
//   node migrate.mjs          (reads DATABASE_URL from the project-root .env)
//
// Migrations use CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE, so re-running is
// safe. Each file is applied as one statement batch; a failure stops the run.
// =============================================================================

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(HERE, '..', '.env') });

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in .env');
  process.exit(1);
}

const dir = join(HERE, '..', 'supabase', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
console.log(`Applying ${files.length} migrations from supabase/migrations/`);

const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  for (const f of files) {
    process.stdout.write(`  ${f} … `);
    await client.query(readFileSync(join(dir, f), 'utf-8'));
    console.log('ok');
  }
  console.log('\n✓ All migrations applied.');
} catch (e) {
  console.error(`\n✗ Failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
