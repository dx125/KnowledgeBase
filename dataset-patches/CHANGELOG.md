# dataset-patches changelog

Newest first. Each entry: what changed, why, and the raw dataset version it was authored
against. See `README.md` for the reproducibility model.

## 2026-06-19 — Card-text de-collapse (RU → EN/ES/DE), authored against `v6_5_localized`

The vendor's v6.5 localization collapsed EN/ES/DE card text into one generic template per
content-category, making 192/265 cards appear duplicated while RU stayed distinct. Decision
(owner): **translate from RU, delete nothing**. Corrections stored as overrides so they
re-apply on the next raw drop.

- **Infrastructure**
  - `scripts/lib/apply-overrides.mjs` — applies `card-overrides.json` onto raw locales at
    deploy time; re-derives `search_text`; drift-guards on RU body hash.
  - `scripts/merge-overrides.mjs` — authoring helper (merge translation batches).
  - `scripts/check-overrides.mjs` — coverage / drift / collapse report.
  - `scripts/deploy.mjs` — now applies overrides after loading raw locales; `source_hash`
    covers raw + overrides.
- **Translations**
  - `card.real_estate_rent.advice.40` — "40 practical tips for renting housing": EN/ES/DE
    rewritten as the full 40-item list (previously a ~14-bullet paraphrase). Migrated here
    from an earlier in-place edit so it is now tracked/reproducible.
  - _(remaining topics translated in batches — see git history)_
