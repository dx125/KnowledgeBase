# Dataset schema

Three schema surfaces, all version-pinned and committed:

1. **Database schema** — the live Postgres tables + RPCs (`supabase/migrations/*.sql`).
2. **Patch-layer schemas** — the shape of the git-owned editorial files (`dataset-patches/*`).
3. **Raw vendor model** — the upstream files we consume read-only (`schemas/upstream/`).

JSON Schemas for everything we author live in [`schemas/`](schemas/); the upstream
schemas are mirrored in [`schemas/upstream/`](schemas/upstream/).

---

## 1. Database schema (Postgres)

Defined by `supabase/migrations/0001_schema.sql` … `0009_questions.sql`, applied in
order by `scripts/migrate.mjs` (idempotent: `create … if not exists` / `create or replace`).
RLS is on for every table with no anon/authenticated grants — only `service_role`
(the Edge Function + deploy) can read/write.

### Content (language-neutral)
- **`topics`** — `topic_id` PK, `sensitivity`, `default_staleness_risk`, `clean_message_count`.
- **`subtopics`** / **`keywords`** — id PK (+ `topic_id` on subtopics).
- **`cards`** — `card_id` PK, `topic_id` FK, `card_type` (`summary`/`how_to`/`public_overview`/`faq`),
  `content_category` (`overview`/`advice`/`checklist`/`warning`/`instruction`/`reference`/`community_experience`/`faq`),
  `status` (`active`/`needs_review`/`needs_expert_review`), `visibility` (`public`/`internal`),
  `confidence`, `staleness_risk`, `needs_review`, `sensitivity_tags[]`, `sensitivity_level`,
  `quality_score`, `confidence_score`, `alignment_score`, `last_confirmed_date`,
  `stale_after_days`, `requires_periodic_check`, `search_boost`,
  `first_seen_message_date`, `last_updated_from_message_date`, `source_stats` (jsonb), `version`.
- **`card_subtopics`** / **`card_keywords`** — link tables.

### Localization (per `(entity, locale)`, locales `ru`/`en`/`es`/`de`)
- **`topic_translations`** (`title`, `description`), **`subtopic_translations`**, **`keyword_translations`**.
- **`card_translations`** — `title`, `short_body`, `body`, `search_text`, `keywords_text`,
  `search_vector` (weighted per-locale `tsvector`, filled by trigger). RU is the editorial source;
  EN/ES/DE fall back to EN per-row at read time.

### Search / related context
- **`search_aliases`** — synonym/cross-lingual expansion (glossary + entity surface forms).
- **`glossary_terms`/`glossary_translations`**, **`entities`/`entity_translations`**,
  **`resources`/`resource_translations`** (+ `card_glossary_terms`, `card_entities`, `card_resources`).

### Q&A (normalized — v7.3, `0009_questions.sql`)
- **`questions`** — `question_id` PK, **`answer_card_id` FK → cards** (the answer lives once,
  as a card), `topic_id`, `ask_frequency` (int, relative demand signal), `status`, `visibility`.
- **`question_translations`** — `(question_id, locale)`, `phrasings text[]` (`[1]` = primary).

### Operational
- **`kb_data_versions`** — one row per deploy: `version_label`, `source_hash` (sha256 of raw +
  every patch layer), `topic_count`, `card_count`, `translation_count`, `notes`, `deployed_at`.
  This is the version ledger; `GET /version` reads it.
- **`profiles`** — per-user `default_locale` (Supabase Auth).

### RPCs (the only callable surface; `service_role` only)
`list_topics`, `get_topic_cards` (filters `content_category` client-side via `?category=`),
`search_cards` (synonym-expanded FTS + trigram; `?category=faq` scope in the Edge Function),
`get_card`, **`list_questions`** (ranked by `ask_frequency`, optional topic, resolves to the
answer card's localized text), `current_data_version`.

---

## 2. Patch-layer schemas (`dataset-patches/`)

Re-applied on every deploy by `scripts/deploy.mjs`. The four i18n keys of an authored card
are **derived from `card_id`** (`card.X` → `cards.X.{title,short,body,search}`); `search_text`
is `title + short + body`. Link ids that don't resolve to a master are silently dropped (FK-safe).

### `card-overrides.json` — EN/ES/DE corrections of existing vendor cards
Keyed by `card_id`. `ru_body_hash` = `md5(RU body)[:8]` drift guard. Optional `ru` block for
**formatting-only** RU fixes. Schema: [`schemas/card-override.schema.json`](schemas/card-override.schema.json).
See `scripts/lib/apply-overrides.mjs`.

### `new-cards.json` — editorial cards the vendor never produced
Array of self-contained cards (`card_id`, `topic_id`, `content_category`, `card_type`, link ids,
`text.{ru,en,es,de}.{title,short,body}`). Optional **`district_meta`** (place ratings:
`id`, `city`, `safety_level`, `infrastructure_level`, `price_level`, `tags[]` — also folded into the
body so it reaches `search_text`). Carries a **`service`** block (see §4).
Schema: [`schemas/new-card.schema.json`](schemas/new-card.schema.json). See `scripts/lib/apply-new-cards.mjs`.

### `faq.json` — Q&A answer-cards + their topics
`{ topics: [ {topic_id, sensitivity, default_staleness_risk, text.{loc}.{title,description}, service} ],
   questions: [ {card_id, topic_id, ask_signal, sensitivity_tags, text.{loc}.{title,short,body}, service} ] }`.
Registers dedicated `topic.faq_*` topics (the vendor taxonomy has none) and one **answer-card** per
question (`content_category=faq`, `card_type=faq`). Schema: [`schemas/faq.schema.json`](schemas/faq.schema.json).
See `scripts/lib/apply-faq.mjs`.

### `questions.json` — questions that reference answer-cards (no duplicated answers)
`{ schema_version, generated_at, source_messages, method, count,
   questions: [ {question_id, answer_card_id, topic_id, ask_frequency, locales.{loc}: [phrasings] } ] }`.
The **answer lives once** (the `answer_card_id` card); the question only points at it and carries the
phrasings + `ask_frequency`. Regenerated by `scripts/build-questions.mjs`.
Schema: [`schemas/questions.schema.json`](schemas/questions.schema.json). See `scripts/lib/apply-questions.mjs`.

---

## 3. Raw vendor model (read-only, `schemas/upstream/`)

The upstream "first dataset developer" pipeline we consume. Anti-loss by design — every card
traces to evidence:
- **`clean_messages.jsonl`** — normalized source chat messages (the recall floor).
- **`claims.jsonl`** — atomic factual claims, each with `supporting_clean_message_ids` (→ which
  messages back it) and topic/keyword links. Cards are assembled from claims.
- **`kb_cards.json`** — `{ schema_version, generated_at, cards: [...], taxonomies.topics: [...] }`.
- **`locale_<loc>.json`** — `{ meta, topics, subtopics, keywords, cards }` flat i18n key maps.
- **`questions.json`** (upstream) — `{ schema_version, generated_at, questions: [{question_id,
  card_ids[], locales.{loc}: [phrasings]}] }`. Our `questions.json` follows this model and adds
  `ask_frequency`.
- `glossary.json`, `entity_index.json`, `resources.json`, `search_dictionary.json`, plus the
  release-gate reports (`validation_report.json`, `coverage_report.json`, `quality_report.json`, …).

---

## 4. Service / regeneration metadata (`service` block)

Every editorial card and FAQ topic carries a non-localized **`service`** block describing what it
answers and how to rebuild it — the "how would we recreate this card" context, separate from the
user-visible localized text:

```json
"service": {
  "source_intent": "What are the 40 most common practical tips for first-time renters?",
  "kind": "faq_answer | reference | place_guide | city_overview | faq_topic",
  "evidence": "telegram_chat_synthesis",
  "note": "optional — e.g. 'see questions.json for the question + ask_frequency'"
}
```

Vendor cards don't need this field: their service info is the upstream **claims → clean_messages**
evidence chain (each card's `source_stats` + the claim links). Schema:
[`schemas/service.schema.json`](schemas/service.schema.json).

## 5. Versioning fields (what to bump and where)

- **Raw vendor**: `DATASET_MANIFEST.json.version` (e.g. `6.6.0-decollapsed`) + per-file `schema_version`.
- **Our deploy**: `kb_data_versions.version_label` (`vX.Y …`) + `source_hash` (covers raw + all layers).
- **DB schema**: numbered migrations `000N_*.sql` (append-only; never edit a shipped migration's effect).
- **questions.json**: `schema_version` + `generated_at` + `method` (so ask_frequency is reproducible).
- **dataset/MANIFEST.json**: `generated_at` + per-layer `sha256` (regenerate after any layer change).
