// =============================================================================
// Provision a dedicated Supabase "service account" user for an integrating app.
//
//   node provision-app-user.mjs --email app-ios@kb.local --locale ru
//   node provision-app-user.mjs --email app-ios@kb.local --password "<pw>" --locale es
//
// The app's OWN backend signs in with these credentials (email+password) to get
// a JWT, then calls the KB API server-to-server with `apikey: <anon>` +
// `Authorization: Bearer <jwt>`. The credentials live only on that backend —
// never shipped to the mobile device. See docs/MOBILE_INTEGRATION.md.
//
// Requires in .env:  VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL.
// (service_role key: Dashboard → Project Settings → API → service_role secret.)
// Alternative: create the user by hand in Dashboard → Authentication → Users.
// =============================================================================

import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';

const HERE = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: join(HERE, '..', '.env') });

const argv = process.argv.slice(2);
const val = (n) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const { DATABASE_URL } = process.env;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.');
  console.error('Get the service_role secret from Dashboard → Project Settings → API.');
  process.exit(1);
}

const email = val('email');
if (!email) {
  console.error('Usage: node provision-app-user.mjs --email <addr> [--password <pw>] [--locale ru|en|es|de]');
  process.exit(1);
}
const locale = (val('locale') ?? 'ru').toLowerCase();
if (!['ru', 'en', 'es', 'de'].includes(locale)) { console.error('locale must be ru|en|es|de'); process.exit(1); }
// Strong random password if none supplied (the app backend stores it as a secret).
const password = val('password') ?? randomBytes(24).toString('base64url');

// 1) Create the auth user via the GoTrue admin API (email pre-confirmed).
const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
  method: 'POST',
  headers: {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({ email, password, email_confirm: true }),
});
const created = await res.json();
if (!res.ok) {
  console.error(`Failed to create user (${res.status}):`, created?.msg ?? created?.error ?? JSON.stringify(created));
  process.exit(1);
}
const userId = created.id;

// 2) Set the app's default locale on its auto-created profile row.
if (DATABASE_URL) {
  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(
      `insert into profiles (id, default_locale) values ($1, $2)
       on conflict (id) do update set default_locale = excluded.default_locale`,
      [userId, locale],
    );
  } finally {
    await client.end();
  }
}

console.log('\n✓ Provisioned service-account user. Give these to the app backend (store as secrets):\n');
console.log(`  email:          ${email}`);
console.log(`  password:       ${password}`);
console.log(`  user_id:        ${userId}`);
console.log(`  default_locale: ${locale}`);
console.log('\nThe backend signs in with email+password to obtain a JWT, then calls the KB API with');
console.log('`apikey: <anon>` + `Authorization: Bearer <access_token>`. See docs/MOBILE_INTEGRATION.md.');
console.log('To revoke: delete the user in Dashboard → Authentication → Users (or via the admin API).\n');
