# Mobile / external app integration — KB API

How an external application (e.g. a mobile app) authenticates with a **per-app token**
and renders a **list of the most important rent advices**. No Supabase SDK and no end-user
login are required — the app holds one long-lived token and makes plain HTTPS calls.

- **Base URL:** `https://bzqpqncoeilhzukohynz.supabase.co/functions/v1/kb`
- **Auth:** one per-app token, sent on every request (except `GET /`).
- **Format:** JSON. **Locales:** `ru` (default), `en`, `es`, `de`; unknown → `en`.

---

## 1. Authentication — per-app token (do this first)

The API accepts a **per-application token** so a mobile app never has to implement user
sign-up/login. The token is issued once, server-side, and identifies the app. It carries:
a default locale, whether the app may see internal/unreviewed cards (`allow_internal`, default
**false** = public content only), and an optional expiry (default: **permanent**).

### 1.1 Issue a token (backend operator, one-time)

From `scripts/` (needs `DATABASE_URL` in `.env`):

```bash
npm run issue-token -- --name "uy-mobile-ios" --locale ru
# options: --locale ru|en|es|de   --internal   --expires YYYY-MM-DD
npm run issue-token -- --list                 # list issued apps (no secrets)
npm run issue-token -- --revoke <client_id>   # disable a token immediately
```

It prints the raw token **once**:

```
TOKEN:  kb_live_oF6xy3iuN9ddw_izCGgKfgrX-IanBVueLmsfWLxFTm8
```

Only the SHA-256 **hash** is stored (`api_clients.token_hash`); the raw token is never
persisted. If it leaks or is lost, `--revoke` it and issue a new one.

### 1.2 Send the token from the app

Send it on **every** request (except `GET /`), either header works:

```
Authorization: Bearer kb_live_oF6xy3iuN9ddw_izCGgKfgrX-IanBVueLmsfWLxFTm8
```
or
```
X-API-Key: kb_live_oF6xy3iuN9ddw_izCGgKfgrX-IanBVueLmsfWLxFTm8
```

That's the whole auth story — **no `apikey`/anon key, no JWT, no login screen.** The KB
function authenticates the token itself (the Supabase gateway's JWT check is disabled for it).

### 1.3 Security notes
- Treat the token like a password. Don't commit it; inject it at build/runtime (e.g. CI
  secret → secure config). On mobile, store at rest in the Keychain (iOS) / Keystore (Android).
- A token embedded in a shipped binary is **extractable** by a determined user. Mitigations:
  keep `allow_internal=false` (public content only — the default), set an `--expires` and
  rotate, and `--revoke` + reissue if abused. For per-end-user entitlements, use the end-user
  login flow instead (see §6).
- Rotation: issue the new token, ship it, then revoke the old one (overlap = zero downtime).

---

## 2. The endpoint for "rent advice"

Cards are grouped by **topic** and tagged with an editorial **`content_category`**
(`advice`, `checklist`, `warning`, `overview`, `instruction`, `community_experience`,
`reference`). "Rent advice" = the **`advice`** cards in the rent topic, already returned
**most-important-first** (editorial boost + quality ordering).

```
GET /topics/topic.real_estate_rent/cards?category=advice&locale=ru
```

- `topic.real_estate_rent` — the rent/housing topic id (see §5 to discover topics dynamically).
- `category=advice` — keep only advice cards (omit to get the full topic, overview-first).
- `locale=ru` — optional; falls back to the token's default locale, then `ru`.

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

Render each card as a list row: **`title`** + `short_body` (one-line preview); open the full
`body` on tap. To show richer detail (related glossary terms, organizations) fetch the single
card (§5, `GET /cards/:id`).

---

## 3. Minimal client code

### Swift (iOS)

```swift
struct Card: Decodable {
    let cardId: String, title: String?, shortBody: String?, body: String?
    let contentCategory: String?
    enum CodingKeys: String, CodingKey {
        case cardId = "card_id", title, shortBody = "short_body", body
        case contentCategory = "content_category"
    }
}
struct TopicCards: Decodable { let cards: [Card] }

let base = "https://bzqpqncoeilhzukohynz.supabase.co/functions/v1/kb"
let token = Secrets.kbApiToken  // from Keychain / build config — never hard-code

func fetchRentAdvice() async throws -> [Card] {
    var req = URLRequest(url: URL(string: "\(base)/topics/topic.real_estate_rent/cards?category=advice&locale=ru")!)
    req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    let (data, resp) = try await URLSession.shared.data(for: req)
    guard (resp as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.userAuthenticationRequired) }
    return try JSONDecoder().decode(TopicCards.self, from: data).cards
}
```

### Kotlin (Android)

```kotlin
val base = "https://bzqpqncoeilhzukohynz.supabase.co/functions/v1/kb"
val token = BuildConfig.KB_API_TOKEN  // injected secret, stored in Keystore at runtime

suspend fun fetchRentAdvice(): JSONArray = withContext(Dispatchers.IO) {
    val url = URL("$base/topics/topic.real_estate_rent/cards?category=advice&locale=ru")
    (url.openConnection() as HttpURLConnection).run {
        setRequestProperty("Authorization", "Bearer $token")
        check(responseCode == 200) { "KB API error $responseCode" }
        JSONObject(inputStream.bufferedReader().readText()).getJSONArray("cards")
    }
}
```

### React Native / TypeScript

```ts
const BASE = 'https://bzqpqncoeilhzukohynz.supabase.co/functions/v1/kb';
const TOKEN = Config.KB_API_TOKEN; // react-native-config / secure store

export async function fetchRentAdvice(locale = 'ru') {
  const res = await fetch(
    `${BASE}/topics/topic.real_estate_rent/cards?category=advice&locale=${locale}`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  if (!res.ok) throw new Error(`KB API ${res.status}`);
  return (await res.json()).cards as Array<{ card_id: string; title: string; short_body: string; body: string }>;
}
```

---

## 4. Quick test with curl

```bash
BASE="https://bzqpqncoeilhzukohynz.supabase.co/functions/v1/kb"
TOK="kb_live_…"   # your issued token

curl -s "$BASE/"                                                   # open descriptor, no auth
curl -s -H "Authorization: Bearer $TOK" \
  "$BASE/topics/topic.real_estate_rent/cards?category=advice&locale=ru"
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/topics"            # → 401 (no token)
```

---

## 5. Full endpoint reference

All routes are under the base URL and require the token (except `GET /`). Locale resolution:
`?locale=` → token default → `ru`.

| Method & path | Purpose | Key params |
|---|---|---|
| `GET /` | API descriptor | — (open, no auth) |
| `GET /me` | Echo the calling app (name, default locale, `allow_internal`) | — |
| `GET /topics` | List topics with a public card | `locale`, `internal` |
| `GET /topics/:topicId/cards` | Cards in a topic, importance-ordered | `locale`, `category`, `internal` |
| `GET /search` | Ranked, synonym-expanded search | `q`, `locale`, `topic`, `limit` (≤100), `offset` |
| `GET /cards/:cardId` | One card incl. keywords, subtopics, glossary, entities | `locale` |
| `GET /version` | Deployed dataset version | — |

Notes:
- **`category`** values: `advice`, `checklist`, `warning`, `overview`, `instruction`,
  `community_experience`, `reference`. Omit to get the whole topic (overview/summary first).
- **`internal=1`** is honored only if the token was issued with `--internal`
  (`allow_internal=true`); otherwise it's ignored and only public+active cards are returned.
- Discover topic ids dynamically via `GET /topics` instead of hard-coding
  `topic.real_estate_rent`, so new topics appear without an app update.
- `PUT /me` (change stored default locale) is **end-user only** — app tokens get `403`. Set an
  app's locale at issuance (`--locale`) or pass `?locale=` per request.

### Errors
JSON body `{ "error": "...", "message": "..." }` with status: `401` (missing/invalid/revoked
token), `403` (action not allowed for an app token), `400` (bad input), `404` (no such
card/route), `500` (server). Treat `401` as "token revoked/expired" → surface a clear message;
there's no refresh flow for app tokens (reissue server-side).

---

## 6. When to use end-user login instead

Per-app tokens are for app-wide, read-only access to public knowledge. Use the **end-user**
flow (Supabase Auth email+password; `Authorization: Bearer <user-jwt>`) when you need
per-user state — a user's saved default locale via `PUT /me`, or per-user entitlements to
internal content. Both auth methods hit the same endpoints; the app-token path simply skips
the login UI. The web app (`web/`) is the reference for the end-user flow.
```
