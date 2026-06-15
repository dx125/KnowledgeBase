// =============================================================================
// Issue a per-application API token for the KB API.
//
//   node issue-token.mjs --name "uy-mobile-ios"
//   node issue-token.mjs --name "uy-mobile-ios" --locale es --internal --expires 2027-01-01
//   node issue-token.mjs --list                       # show issued clients (no secrets)
//   node issue-token.mjs --revoke <client_id>         # deactivate a token
//
// The raw token is printed ONCE and never stored — only its SHA-256 hash goes in
// the api_clients table. If lost, revoke and issue a new one. Hand the token to
// the app over a secure channel; treat it like a password.
// =============================================================================

import { randomBytes, createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(HERE, '..', '.env') });

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL in .env');
  process.exit(1);
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  if (flag('list')) {
    const { rows } = await client.query(
      `select client_id, name, token_prefix, default_locale, allow_internal, active,
              created_at, last_used_at, expires_at
       from api_clients order by created_at desc`,
    );
    if (!rows.length) console.log('No API clients issued yet.');
    for (const r of rows) {
      console.log(
        `${r.active ? '●' : '○'} ${r.name}  [${r.token_prefix}…]  locale=${r.default_locale}` +
          `  internal=${r.allow_internal}  id=${r.client_id}` +
          `  used=${r.last_used_at ? r.last_used_at.toISOString() : 'never'}` +
          `${r.expires_at ? `  expires=${r.expires_at.toISOString()}` : ''}`,
      );
    }
    process.exit(0);
  }

  if (flag('revoke')) {
    const id = val('revoke');
    if (!id) { console.error('Usage: --revoke <client_id>'); process.exit(1); }
    const { rowCount } = await client.query('update api_clients set active = false where client_id = $1', [id]);
    console.log(rowCount ? `Revoked ${id}.` : `No client with id ${id}.`);
    process.exit(0);
  }

  // --- Issue a new token -----------------------------------------------------
  const name = val('name');
  if (!name) { console.error('Usage: node issue-token.mjs --name "<app-name>" [--locale ru|en|es|de] [--internal] [--expires YYYY-MM-DD]'); process.exit(1); }
  const locale = (val('locale') ?? 'ru').toLowerCase();
  if (!['ru', 'en', 'es', 'de'].includes(locale)) { console.error('locale must be ru|en|es|de'); process.exit(1); }
  const allowInternal = flag('internal');
  const expires = val('expires') ?? null; // null = permanent

  // Token: kb_live_<43 url-safe chars> (256 bits of entropy).
  const token = 'kb_live_' + randomBytes(32).toString('base64url');
  const prefix = token.slice(0, 16); // 'kb_live_' + 8 chars, for display
  const hash = sha256(token);

  const { rows } = await client.query(
    `insert into api_clients (name, token_prefix, token_hash, default_locale, allow_internal, expires_at)
     values ($1, $2, $3, $4, $5, $6) returning client_id`,
    [name, prefix, hash, locale, allowInternal, expires],
  );

  console.log('\n✓ Issued API token. Store it now — it will not be shown again.\n');
  console.log(`  app:            ${name}`);
  console.log(`  client_id:      ${rows[0].client_id}`);
  console.log(`  default_locale: ${locale}`);
  console.log(`  allow_internal: ${allowInternal}`);
  console.log(`  expires:        ${expires ?? 'never (permanent)'}`);
  console.log(`\n  TOKEN:  ${token}\n`);
  console.log('  Use it as:  Authorization: Bearer ' + token);
  console.log('       or as:  X-API-Key: ' + token + '\n');
} catch (e) {
  console.error('Failed:', e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
