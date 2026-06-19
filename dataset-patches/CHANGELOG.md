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
  - **All 265 cards** (every topic) translated RU → EN/ES/DE (title/short/body), faithful to
    the RU source, loanwords/proper nouns preserved (cédula, gastos comunes, escribano, DGI,
    BPS, Fonasa, UTE/OSE/Antel, empresa, unipersonal, monotributo, SAS, etc.). `search_text`
    re-derived per card from the translated fields.
  - Result (verified live): still-collapsed EN/ES/DE bodies **192 → 0**; 265 distinct bodies
    per locale (matches RU); 0 Cyrillic in EN/ES/DE; the former "reference: reference note"
    titles now read e.g. "Finding housing: what to know" / "Búsqueda de vivienda…".
  - No cards deleted — the apparent duplication was a translation artifact, not real
    duplication (RU was always distinct). See `../docs/DATASET_DUPLICATION_REPORT.md`.
