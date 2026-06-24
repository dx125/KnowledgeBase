# dataset-patches — our owned corrections to the raw dataset

We are the dataset team now. The raw dataset we receive (`DATASET_DIR`, e.g.
`kb_dataset_uy_v6_5_localized`) is treated as **read-only input**. Every correction we
make lives here, in git, and is **re-applied on every deploy** — so it survives a new
raw-data drop instead of being silently overwritten.

## Why this exists

The vendor build passes its "no Cyrillic" localization gate by replacing reader-facing
card text (`title` / `short` / `body`) in EN/ES/DE with **one generic template per
content-category**. Result: in RU every card is distinct, but in EN/ES/DE ~192 of 265
cards share a collapsed body, so cards look duplicated by header and content
(e.g. every `reference` card shows *"reference: reference note"*; every `advice` card
shows the same bullet list). See `../docs/DATASET_LOCALIZATION_REPORT.md`.

Rather than delete the apparent duplicates (which would destroy distinct RU content), we
**translate from the RU source** and store the corrected EN/ES/DE text as overrides.

## Files

| File | What |
|---|---|
| `card-overrides.json` | EN/ES/DE corrections to cards that already exist in the raw dataset. Keyed by `card_id`. RU never overridden. |
| `new-cards.json` | Cards the vendor build never produced, authored by us (RU + EN/ES/DE) to close content gaps. Appended at deploy/build time. |
| `faq.json` | The Q&A section: dedicated `topic.faq_*` topics + one card per question. Registers the topics **and** appends the cards. |
| `CHANGELOG.md` | Dated log of what was changed and why. |

### `faq.json` shape (Q&A section)

Unlike the other layers, this one also creates **new topics** (the raw taxonomy has none for FAQ).
`scripts/lib/apply-faq.mjs` registers each topic into `kb.taxonomies.topics` + the per-locale topic
tables, then appends one card per question (`content_category='faq'`, `card_type='faq'`): the
**question is the `title`**, a one-line answer the `short_body`, the full answer the `body`. The four
i18n keys derive from `card_id` and `search_text` is title+short+body, same as `new-cards.json`.

```json
{
  "topics": [
    { "topic_id": "topic.faq_residency", "sensitivity": "high", "default_staleness_risk": "high",
      "text": { "ru": {"title":"…","description":"…"}, "en": {…}, "es": {…}, "de": {…} } }
  ],
  "questions": [
    { "card_id": "card.faq_residency.q01_how_to_get", "topic_id": "topic.faq_residency",
      "ask_signal": 4357, "sensitivity_tags": ["legal"],
      "text": { "ru": {"title":"<question>","short":"<1-line answer>","body":"<full answer>"}, "en": {…}, "es": {…}, "de": {…} } }
  ]
}
```

Use **zero-padded** question slugs (`…q01_…`, `…q02_…`) — `get_topic_cards` orders FAQ cards by
`card_id`, so the padding fixes the display order. Because FAQ topics are first-class topics, clients
tell them apart by the `topic.faq_` id prefix; the existing API already loads them
(`GET /topics/topic.faq_<x>/cards`) and searches them (`/search?topic=` / `/search?q=` /
`/search?category=faq`).

### `new-cards.json` shape

Each entry is one self-contained card — metadata + all four locales inline. The four i18n keys
are **derived from `card_id`** (`card.X` → `cards.X.{title,short,body,search}`), and `search_text`
is derived from title+short+body, so the authoring file stays compact:

```json
[
  {
    "card_id": "card.taxes_accounting_empresa.reference.ref_nalogovye_kanikuly",
    "topic_id": "topic.taxes_accounting_empresa",
    "content_category": "reference", "visibility": "public", "status": "active",
    "needs_review": true, "staleness_risk": "high",
    "subtopic_ids": ["…"], "keyword_ids": ["…"], "glossary_term_ids": ["…"],
    "text": { "ru": {"title":"…","short":"…","body":"…"}, "en": {…}, "es": {…}, "de": {…} }
  }
]
```

Link ids (glossary/entity/resource/subtopic) that don't resolve to a master are silently dropped
by deploy, so **reuse existing ids** to stay FK-safe. `applyNewCards()` skips any `card_id` that
already exists in the raw dataset (never clobbers a real card).

**Optional `district_meta`.** A card may carry a structured `district_meta` block (used by the
per-place guides — Montevideo/PdE/Piriápolis districts plus standalone towns like Colonia, Salto,
La Paloma) — `id` (`<city|region>.<place>`), `city`, `safety_level`,
`infrastructure_level`, `price_level` (`high`/`medium`/`low`) and `tags`. `applyNewCards()` copies
it verbatim onto the card for downstream use. The cards table has no JSONB column, so to keep the
ratings **searchable today** the same facts are also folded into the card body (e.g.
`Безопасность: высокая · Инфраструктура: высокая · Цены: высокие`), which feeds `search_text`.

> **Shipping the corrections into a new raw version.** The corrections also exist as a baked
> dataset version — `kb_dataset_uy_v6_6` (`6.6.0-decollapsed`), built by
> `scripts/build-dataset-version.mjs`, which folds `card-overrides.json` into the locale files
> and regenerates the manifest. v6.6 is verified idempotent under the override layer (0 diffs),
> so pointing `DATASET_DIR` at it makes the override layer a no-op. Rebuild after editing
> overrides: `node scripts/build-dataset-version.mjs --dest <dir> --version <x.y.z>`.

### `card-overrides.json` shape

```json
{
  "card.real_estate_rent.advice.40": {
    "ru_body_hash": "04b7a0ff",
    "en": { "title": "…", "short": "…", "body": "…" },
    "es": { "title": "…", "short": "…", "body": "…" },
    "de": { "title": "…", "short": "…", "body": "…" }
  }
}
```

- `ru_body_hash` is `md5(RU body)[:8]` at authoring time — a **drift guard**. If the RU
  source for that card changes in a future raw version, the hash won't match and tooling
  flags the translation as possibly stale.
- `search_text` is **not** stored: it is re-derived at deploy time from the translated
  `title`+`short`+`body`, so per-language full-text search keeps working.

## How it's wired

`scripts/deploy.mjs` loads the raw locales, then calls `applyCardOverrides()`
(`scripts/lib/apply-overrides.mjs`) to write EN/ES/DE corrections into the in-memory locale
objects, then `applyNewCards()` (`scripts/lib/apply-new-cards.mjs`) to append our editorial
cards, before rows are built. The raw files on disk are never modified. The deploy `source_hash`
includes both layers, so the version row reflects raw + corrections + new cards.

## Workflows

**Add / edit translations** — author a batch file (card-centric, all locales together):

```jsonc
// batch.json
{
  "card.real_estate_rent.advice.advice": {
    "en": { "title": "…", "short": "…", "body": "…" },
    "es": { "title": "…", "short": "…", "body": "…" },
    "de": { "title": "…", "short": "…", "body": "…" }
  }
}
```

```bash
node scripts/merge-overrides.mjs batch.json   # validates card ids, records ru_body_hash
node scripts/check-overrides.mjs              # coverage + drift + collapse report
npm run deploy                                 # raw + overrides -> Supabase (atomic)
```

**When a NEW raw version arrives** — point `DATASET_DIR` at it and run:

```bash
node scripts/check-overrides.mjs   # lists RU-source drift + any vanished card_ids
```

- **Drift** (RU body changed): re-translate those cards and re-merge.
- **Unknown card_ids** (card removed/renamed upstream): update or drop those override keys.
- Cards whose RU source is unchanged keep their existing translation automatically.
