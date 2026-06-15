# Uruguay Knowledge Base

A Supabase-backed, multilingual, searchable knowledge base built from the
`kb_dataset_uy_v5_quality` dataset (practical Uruguay-relocation knowledge distilled
from community chats).

- **Database:** Supabase / Postgres with per-locale full-text search (`tsvector`)
  + trigram fuzzy matching (`pg_trgm`) + synonym/cross-lingual query expansion. No
  embeddings — fully deterministic.
- **API:** a Supabase **Edge Function** (`kb`) is the only thing that touches the
  database. The browser calls its HTTP endpoints and never sees Postgres. Direct
  table/RPC access for the public key is revoked.
- **Auth:** Supabase Auth (email + password). Every data endpoint requires a
  signed-in user; each user has a stored **default locale**.
- **Access control:** v5 cards carry `visibility` (public/internal) and `status`
  (active / needs_review / needs_expert_review). Default view = **public + active**;
  signed-in users can toggle "show internal/unreviewed" to see the rest (flagged).
- **Frontend:** Vite + React + TypeScript + Tailwind, talking to the API over
  `fetch`. Login/signup gate, browse topics, search the base or a topic, switch
  locale (which saves as the account default), toggle internal cards.
- **Locales:** per request → user default → `ru`. Invalid locale → `en`. Supported
  `ru/en/es/de`.

```
KnowledgeBase/
├─ supabase/
│  ├─ migrations/         # 0001 schema · 0002 RPCs · 0003 versions · 0004 lock-down · 0005 auth/profiles
│  └─ functions/kb/       # public HTTP API (Edge Function)
├─ scripts/               # one-click atomic data deploy (dataset → Supabase)
└─ web/                   # React app (auth + calls the API)
```

### Request flow

```
browser ──login──▶ Supabase Auth (GoTrue)            ── issues user JWT
        ──HTTP(user JWT)──▶ Edge Function `kb` ──service_role──▶ Postgres RPCs ──▶ tables
                            (the only DB client)                  (FTS + trigram)
```

supabase-js in the browser is used **only for auth**; it never queries the DB.
Data flows exclusively through the Edge Function, which requires a valid user
token (the anon key alone → `401`) and reads via `service_role`. Migrations `0004`
(content) and `0005` (profiles) revoke all direct table/RPC access for the public
roles, so every reachable thing is an explicit, authenticated API endpoint.

## Data model

The dataset keeps cards **language-independent** (stable slug IDs) and stores all
display text in separate locale files. The schema mirrors that:

| Table | Purpose |
|---|---|
| `topics`, `subtopics`, `keywords` | language-independent taxonomy (`subtopics` carry `topic_id`) |
| `cards` | 437 cards (`card_type` summary/how_to) + `visibility`, `status`, quality/validity metadata |
| `card_subtopics`, `card_keywords` | card ↔ taxonomy joins |
| `topic_translations`, `subtopic_translations`, `keyword_translations` | localized labels (subtopics now genuinely localized) |
| `card_translations` | localized `title` / `short_body` / `body` / `search_text` + a weighted `search_vector` |
| `search_aliases` | synonym/cross-lingual expansion (from glossary + entity aliases) |

Only taxonomy actually referenced by cards is imported (97 subtopics, 889 keywords).

`card_translations.search_vector` is built by a trigger using the Postgres text
config that matches the row's locale (`russian`/`english`/`spanish`/`german`),
weighted **A** title → **B** keyword terms + the curated multilingual `search_text`
→ **C** short body → **D** full body.

Internally the schema exposes SQL functions the Edge Function calls (not reachable
from the browser): `list_topics`, `get_topic_cards`, `search_cards`, `get_card`,
`kb_expand_query`, `current_data_version`. Each normalizes the locale
(`ru/en/es/de`, else `en`) and falls back to the EN translation per-row if missing.
The first three take `p_include_internal` (default false → public+active only).

Ranking: `ts_rank` over the weighted vector × the per-card editorial `search_boost`,
plus a trigram-similarity boost on title/short body for typos. Queries are first
expanded with `search_aliases` so a search for `электричество` also matches `UTE`,
`cédula` matches its variants, etc.

Security: Row-Level Security is on; the public roles have **no** direct table/RPC
access (migrations `0004` for content, `0005` for `profiles`). The Edge Function
reads via `service_role`; data writes go through the deploy script's privileged
Postgres connection. User accounts and the per-user `default_locale` live in
`profiles` (one row per `auth.users` id, auto-created on signup).

## HTTP API

Base URL: `https://<project-ref>.supabase.co/functions/v1/kb`

**Auth:** every endpoint except `GET /` requires a signed-in user. Send the user's
access token (obtained from Supabase Auth) plus the project anon key:

```
apikey: <anon key>
Authorization: Bearer <user access token>
```

The anon key alone (no user) is rejected with `401`.

**Locale** (`locale` query param, optional): resolution order is
explicit `?locale=` → the user's stored `default_locale` → `ru`. An invalid value
falls back to `en`. Responses echo the `locale` actually used.

**Scope** (`internal` query param, optional): `internal=1` includes
internal/unreviewed cards; default (omitted) returns only public + active.

| Method & path | Purpose | Params / body |
|---|---|---|
| `GET /` | API descriptor (open, no auth) | — |
| `GET /me` | current user + `default_locale` | — |
| `PUT /me` | set the user's default locale | body `{ "default_locale": "es" }` |
| `GET /topics` | topics with ≥1 card in scope, most content first | `locale`, `internal` |
| `GET /topics/:topicId/cards` | all cards in a topic (summary first) | `locale`, `internal` |
| `GET /search` | ranked, synonym-expanded search; omit `topic` for everything | `q`, `locale`, `topic`, `limit` (≤100, def 20), `offset`, `internal` |
| `GET /cards/:cardId` | one card incl. localized keywords & subtopics | `locale` |
| `GET /version` | currently deployed data version | — |

Example (search; `locale` omitted → uses the user's stored default):

```bash
curl "$BASE/search?q=cedula%20renovar&limit=5" \
  -H "apikey: $ANON" -H "Authorization: Bearer $USER_TOKEN"
```

```jsonc
// GET /search response
{
  "locale": "ru",
  "query": "cedula renovar",
  "topic_id": null,
  "limit": 5, "offset": 0,
  "total": 12,
  "count": 5,
  "results": [
    {
      "card_id": "card.residency_cedula_immigration.first_steps",
      "topic_id": "topic.residency_cedula_immigration",
      "type": "detail_card",
      "title": "…", "short_body": "…", "body": "…",
      "confidence": "medium", "staleness_risk": "high", "needs_review": true,
      "sensitivity_tags": ["legal"], "last_updated": "2026-06-12T…",
      "topic_title": "…", "rank": 0.83
    }
  ]
}
```

Errors return `{ "error": "...", "message"?: "..." }` with status `401`
(not signed in), `400` (bad `PUT /me` body), `404` (unknown route / card),
`405` (method not allowed), or `500`.

## Setup

### 1. Create the database

In your Supabase project, run the migration files **in order**. Either:

**A. Dashboard (simplest)** — open SQL Editor and paste, in order:
`0001_schema.sql` → `0002_functions.sql` → `0003_data_versions.sql` →
`0004_lock_down_direct_access.sql` → `0005_profiles_auth.sql`
(all under `supabase/migrations/`).

**B. Supabase CLI**
```bash
supabase init                       # if the project isn't initialized yet
supabase link --project-ref <ref>
supabase db push                    # applies everything in supabase/migrations
```

Then enable **Email** auth: Dashboard → Authentication → Providers → Email. For
quick local testing you can turn **off** "Confirm email" so sign-up logs in
immediately; leave it on for production.

### 2. Configure environment (one file for everything)

There is a **single `.env` at the project root**, shared by the web app and the
deploy script. Copy the example and fill it in:

```bash
cp .env.example .env
```

| Variable | Used by | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | web app | project URL; the API base is derived as `<url>/functions/v1/kb` |
| `VITE_SUPABASE_ANON_KEY` | web app | anon key — used for auth + as the `apikey` header (no direct DB access) |
| `DATABASE_URL` | deploy | Postgres **Session pooler** string (port 5432), Dashboard → Connect |
| `DATASET_DIR` | deploy | absolute path to the unzipped dataset folder |

Vite only exposes `VITE_`-prefixed variables to the browser, so `DATABASE_URL`
stays server-side even though it lives in the same file.

### 3. Deploy the API (Edge Function)

```bash
supabase functions deploy kb        # deploys supabase/functions/kb
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — no
secrets to set. Locally you can run `supabase functions serve kb` instead.
Verify: `curl https://<ref>.supabase.co/functions/v1/kb -H "apikey: <anon>" -H "Authorization: Bearer <anon>"`.

### 4. Deploy the data (one click)

```bash
cd scripts
npm install
npm run deploy                                   # or: npm run deploy -- --label "2026-06-20 rent polish"
```

This is the **data update mechanism**. It runs a full replace inside a single
transaction (`BEGIN` → delete all → insert all → record version → `COMMIT`):

- **Atomic & zero-downtime** — readers keep seeing the current version until the
  commit, then switch over instantly. A failure rolls back; live data is untouched.
- **Handles edits, renames and deletions** — whatever is in `DATASET_DIR` becomes
  the live data; nothing stale lingers. Safe to re-run any time.
- **Versioned** — every deploy appends a row to `kb_data_versions` (label, sha256
  content hash, row counts, timestamp). `select * from current_data_version();`
  shows what's live. Re-import the same files and the hash will match.

Polish the dataset files, then `npm run deploy` again — that's the whole loop.
Use `npm run deploy -- --dry-run` to validate row counts without touching the DB.
Expected: 20 topics · 437 cards (161 public+active) · 97 subtopics · 889 keywords ·
5772 translations · 49 alias rows.

### 5. Run the web app

```bash
cd web
npm install
npm run dev
```

Open the printed URL. RU is the default locale; use the switcher (top right) to
change it — the choice persists in `localStorage`.

## Dataset v5 — review & what we use

v5 is a large step up and fixes most v3 issues. **Fixed:** subtopics are now
genuinely localized (with a `topic_id` link); card bodies no longer restate
metadata (it lives in structured fields); cards carry real access control
(`visibility`, 3-value `status`) and rich per-card quality/validity/evidence
metadata; JSON Schemas ship in `schemas/`. Base-card text has full ru/en/es/de
parity (0 missing across title/short/body/search).

**What this app ingests** (the publishable core): the 437 base cards + their
localized text and the new `search` blob, the 97 subtopics / 889 keywords actually
referenced, and cross-lingual aliases from `glossary` + `entity_index`. Public view
is the 161 public+active cards; signed-in users can toggle the rest.

**What we deliberately skip** (internal/editor layers, out of scope for a search
app): `claims.jsonl` (58k), `candidate_cards.json` (2,772), `message_coverage_index`,
`questions`, `resources`, and the prebuilt `search_indexes/*.jsonl` (we build our own
per-locale `tsvector` instead — the dataset explicitly avoids embeddings, and FTS
gives us ranking + the `search_dictionary` aliases without a 100 MB RU index).

**Findings worth flagging:**

1. **The keyword "synonym dictionary" is thin for our cards.** Of the 889 keywords
   referenced by cards, the average is ~1.07 surface forms (mostly case variants),
   **zero** `related_keywords`, and zero cross-locale variation in
   `search_dictionary.json`. So real synonym power doesn't come from keywords — it
   comes from the small but genuinely cross-lingual `glossary` (24) and
   `entity_index` (22, e.g. `UTE ↔ electricidad ↔ электричество`). We build
   `search_aliases` from those and from the curated per-card `search` text (which
   already concatenates multilingual keyword forms). *Suggestion:* populate
   `related_keywords` and cross-locale forms to make keyword-level synonyms useful.

2. **Cards don't link to glossary/resources/entities.** `glossary_term_ids`,
   `resource_ids` (and entity links) are empty on cards, so synonym attachment can
   only be global, not per-card. Populating these would allow precise, card-scoped
   expansion and a "related terms/resources" panel.

3. **Most content is gated.** Only 161/437 cards are public+active, and 12 of 20
   topics have no public summary card. The app handles this (topics surface if they
   have ≥1 in-scope card; the internal toggle reveals the rest), but the public
   surface is smaller than the headline 437 suggests — worth knowing for launch.

4. **`needs_review = true` on every card.** Still uniformly set, so it can't drive a
   review queue on its own; the richer `status` (`needs_review` vs
   `needs_expert_review`) and `review_reasons` are the usable signals — the app
   badges those instead.
