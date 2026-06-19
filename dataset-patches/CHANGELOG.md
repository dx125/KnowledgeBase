# dataset-patches changelog

Newest first. Each entry: what changed, why, and the raw dataset version it was authored
against. See `README.md` for the reproducibility model.

## 2026-06-19 — Shipped v6.6 dataset (overrides folded into the source build)

Materialized the override corrections into a standalone raw dataset version so the fix lives
in the source build, not just at deploy time — what the localization report asked the dataset
team to do so the override layer can retire.

- **`scripts/build-dataset-version.mjs`** (new) — folds `card-overrides.json` onto a raw
  dataset's `locale_en/es/de.json` (title/short/body + re-derived search blob), copies every
  other file verbatim, refreshes each rewritten locale's `meta`, writes a `V6_6_…_PATCH.md`,
  and regenerates `DATASET_MANIFEST.json` (version + per-file sha256). Aborts on RU drift or
  unknown card_ids. Uses the *same* `applyCardOverrides()` deploy uses, so the baked text is
  byte-identical to a deploy.
- **Output:** `kb_dataset_uy_v6_6` (version `6.6.0-decollapsed`, derived from
  `6.5.2-localized-quality`). 265/265 distinct bodies per locale, 0 collapsed, 0 Cyrillic in
  EN/ES/DE, search blobs match the derived value.
- **Verified idempotent:** re-applying the override layer to v6.6 yields 0 value-level diffs —
  pointing `DATASET_DIR` at v6.6 makes the override layer a no-op (it can then be retired).
- Build command: `node scripts/build-dataset-version.mjs --dest <dir> --version 6.6.0-decollapsed`
  (`--src` defaults to `DATASET_DIR`). Carried over unchanged: `search_indexes/*`,
  `search_dictionary.json`, `questions.json`, `candidate_cards.json` (their EN/ES/DE still
  reflect v6.5; the app rebuilds search from card text at deploy time).

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
