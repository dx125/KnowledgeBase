# Mobile / external app integration — KB API

How an external application integrates the KB API to show, as a first feature, a **list of the
most important rent advices**. The mobile app talks to **its own backend**; that backend calls
the KB API **server-to-server** using standard Supabase auth (**anon key + a user JWT**). The
KB credentials never ship to the device.

- **Base URL:** `https://bzqpqncoeilhzukohynz.supabase.co/functions/v1/kb`
- **Auth:** `apikey: <anon key>` + `Authorization: Bearer <user access token>` on every request
  (except `GET /`). The anon key is public and safe to hold; the JWT comes from a dedicated
  **service-account** user whose password lives only on the app backend.
- **Format:** JSON. **Locales:** `ru` (default), `en`, `es`, `de`; unknown → `en`.

```
  mobile app  ──►  app backend (trusted)  ──►  KB API (Edge Function)  ──►  Postgres
                   • holds service-account
                     email+password (secret)
                     and the anon key
                   • signs in → JWT, refreshes
                   • calls KB API with anon + JWT
```

Why this shape: the anon key is a public client key (fine to embed anywhere), but it is **not**
sufficient on its own — every data route requires a real signed-in user. Keeping the
service-account credentials on the backend means the device never carries anything that can be
extracted to call the API directly.

---

## 1. Provision a service-account user (operator, one-time per app)

Create one dedicated Supabase user per integrating app. From `scripts/` (needs
`VITE_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `DATABASE_URL` in `.env` — the
service_role secret is in Dashboard → Project Settings → API):

```bash
npm run provision-app-user -- --email app-ios@kb.local --locale ru
# --password "<pw>"  to set your own; otherwise a strong one is generated
# --locale ru|en|es|de  sets the app's default locale (stored on its profile)
```

It prints the credentials **once**:

```
email:          app-ios@kb.local
password:       9b1f…(generated)
user_id:        7c2e…
default_locale: ru
```

The script creates the user with **email pre-confirmed** (via the admin API), so the backend
can log in immediately even though end-user "Confirm email" is enabled. Hand the email+password
to the app backend over a secure channel and store them as backend secrets.

> Manual alternative: Dashboard → Authentication → Users → **Add user** (tick "Auto Confirm
> User"), then set its locale with `PUT /me` once, or leave it `ru` and pass `?locale=` per call.
> To **revoke** an app's access, delete or ban that user in the same screen.

---

## 2. The app backend: sign in, then call the KB API

### 2.1 Get a JWT (Supabase Auth password grant)

```
POST {SUPABASE_URL}/auth/v1/token?grant_type=password
apikey: <anon key>
content-type: application/json

{ "email": "app-ios@kb.local", "password": "<secret>" }
```

Response includes `access_token` (a JWT, ~1 h TTL), `expires_in`, and a `refresh_token`.
Cache the access token; when it nears expiry, refresh without re-sending the password:

```
POST {SUPABASE_URL}/auth/v1/token?grant_type=refresh_token
apikey: <anon key>
content-type: application/json

{ "refresh_token": "<refresh_token>" }
```

### 2.2 Call the KB API

```
GET {BASE}/topics/topic.real_estate_rent/cards?category=advice&locale=ru
apikey: <anon key>
Authorization: Bearer <access_token>
```

Cards are grouped by **topic** and tagged with an editorial **`content_category`**
(`advice`, `checklist`, `warning`, `overview`, `instruction`, `community_experience`,
`reference`). "Rent advice" = the **`advice`** cards in the rent topic, returned
**most-important-first** (editorial boost + quality ordering).

### Example response (trimmed)

```json
{
  "locale": "ru",
  "topic_id": "topic.real_estate_rent",
  "category": "advice",
  "include_internal": false,
  "count": 3,
  "cards": [
    {
      "card_id": "card.real_estate_rent.advice.sovety_novichkam_po_arende",
      "card_type": "summary",
      "content_category": "advice",
      "status": "active",
      "visibility": "public",
      "title": "Советы новичкам по аренде",
      "short_body": "Краткие практические советы…",
      "body": "…",
      "quality_score": 0.86,
      "alignment_score": 0.79,
      "last_updated": "2026-05-29T12:00:08+00:00"
    }
    // … 2 more, importance-ordered
  ]
}
```

The mobile app fetches this list **from its own backend** (which proxies/reshapes the KB
response); it does not call the KB API directly.

---

## 3. Backend reference implementation (Node / TypeScript)

A tiny client that caches the JWT and refreshes it on demand. Use `@supabase/supabase-js`
or plain `fetch` — this uses `fetch` so it has no dependencies.

```ts
const SUPABASE_URL = process.env.SUPABASE_URL!;          // https://<ref>.supabase.co
const ANON = process.env.SUPABASE_ANON_KEY!;             // public anon key
const EMAIL = process.env.KB_SERVICE_EMAIL!;             // service-account creds (secrets)
const PASSWORD = process.env.KB_SERVICE_PASSWORD!;
const BASE = `${SUPABASE_URL}/functions/v1/kb`;

let session: { access_token: string; refresh_token: string; exp: number } | null = null;

async function auth(path: string, body: unknown) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${path}`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`auth ${path} failed: ${r.status}`);
  const j = await r.json();
  session = { access_token: j.access_token, refresh_token: j.refresh_token, exp: Date.now() + j.expires_in * 1000 };
}

async function token(): Promise<string> {
  if (!session) await auth('password', { email: EMAIL, password: PASSWORD });
  else if (Date.now() > session.exp - 60_000) {
    try { await auth('refresh_token', { refresh_token: session.refresh_token }); }
    catch { await auth('password', { email: EMAIL, password: PASSWORD }); } // refresh expired → re-login
  }
  return session!.access_token;
}

async function kb(path: string) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${await token()}` },
  });
  if (r.status === 401) { session = null; throw new Error('KB auth rejected'); }
  if (!r.ok) throw new Error(`KB ${path} -> ${r.status}`);
  return r.json();
}

// The endpoint your mobile app calls:
export async function getRentAdvice(locale = 'ru') {
  const data = await kb(`/topics/topic.real_estate_rent/cards?category=advice&locale=${locale}`);
  return data.cards as Array<{ card_id: string; title: string; short_body: string; body: string }>;
}
```

With `@supabase/supabase-js` the auth+refresh is handled for you:

```ts
import { createClient } from '@supabase/supabase-js';
const sb = createClient(SUPABASE_URL, ANON);
await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
const { data: { session } } = await sb.auth.getSession();   // auto-refreshes
const res = await fetch(`${BASE}/topics/topic.real_estate_rent/cards?category=advice`, {
  headers: { apikey: ANON, Authorization: `Bearer ${session!.access_token}` },
});
```

---

## 4. Quick test with curl

```bash
URL="https://bzqpqncoeilhzukohynz.supabase.co"; ANON="<anon key>"; BASE="$URL/functions/v1/kb"
TOKEN=$(curl -s "$URL/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "content-type: application/json" \
  -d '{"email":"app-ios@kb.local","password":"<secret>"}' | jq -r .access_token)

curl -s -H "apikey: $ANON" -H "Authorization: Bearer $TOKEN" \
  "$BASE/topics/topic.real_estate_rent/cards?category=advice&locale=ru"

curl -s -o /dev/null -w "%{http_code}\n" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  "$BASE/topics"     # → 401 (anon key is not a user)
```

---

## 5. Full endpoint reference

All routes are under the base URL and require `apikey` + a user `Bearer` JWT (except `GET /`).
Locale resolution: `?locale=` → the user's stored default → `ru`.

| Method & path | Purpose | Key params |
|---|---|---|
| `GET /` | API descriptor | — (open; still needs `apikey`+`Bearer <anon>` to pass the gateway) |
| `GET /me` | Echo the service-account user + default locale | — |
| `PUT /me` | Set the user's default locale | body `{ "default_locale": "es" }` |
| `GET /topics` | List topics with a public card | `locale`, `internal` |
| `GET /topics/:topicId/cards` | Cards in a topic, importance-ordered | `locale`, `category`, `internal` |
| `GET /search` | Ranked, synonym-expanded search | `q`, `locale`, `topic`, `limit` (≤100), `offset` |
| `GET /cards/:cardId` | One card incl. keywords, subtopics, glossary, entities | `locale` |
| `GET /version` | Deployed dataset version | — |

Notes:
- **`category`** values: `advice`, `checklist`, `warning`, `overview`, `instruction`,
  `community_experience`, `reference`. Omit to get the whole topic (overview/summary first).
- Discover topic ids dynamically via `GET /topics` rather than hard-coding
  `topic.real_estate_rent`, so new topics appear without an app update.
- **`internal=1`** includes internal/unreviewed cards; the service account may use it, so only
  enable it on backend routes you intend to expose. Default returns public+active only.

### Errors
JSON `{ "error": "...", "message": "..." }`. Statuses: `401` (no/expired/invalid JWT — refresh
or re-login and retry once), `400` (bad input), `404` (no such card/route), `405`, `500`.
A `401` on a previously-working token means it expired → run the refresh flow (§2.1).

---

## 6. Security checklist
- The **anon key** is public; embedding it anywhere is fine. It alone cannot read data (→ 401).
- The **service-account email+password** are secrets — keep them in the backend's secret store
  (env/secret manager), never in the mobile binary, repo, or logs.
- Use a **distinct service-account user per app** so you can revoke one without affecting others
  (delete/ban the user in the Dashboard).
- Never expose `service_role` or the Postgres `DATABASE_URL` to any app backend — those stay
  with the KB operator (the Edge Function holds `service_role`; clients never get it).
- Rotate by provisioning a new user, switching the backend's secrets, then deleting the old user.
```
