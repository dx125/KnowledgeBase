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
| `card-overrides.json` | The corrections. Keyed by `card_id`. RU is never overridden. |
| `CHANGELOG.md` | Dated log of what was changed and why. |

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

`scripts/deploy.mjs` loads the raw locales, then calls
`applyCardOverrides()` (`scripts/lib/apply-overrides.mjs`) which writes the overridden
values into the in-memory locale objects before rows are built. The raw files on disk are
never modified. The deploy `source_hash` includes the overrides, so the version row
reflects raw + corrections.

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
