# dataset-patches changelog

Newest first. Each entry: what changed, why, and the raw dataset version it was authored
against. See `README.md` for the reproducibility model.

## 2026-06-19 — New editorial cards (batch 2): rent garantía + purchase costs

Closed the remaining gaps from the rent/purchase/taxes content review. 3 more public cards
(RU source + EN/ES/DE), bringing `new-cards.json` to 6 and the dataset to **271 cards**:

- `card.real_estate_rent.reference.ref_garantii_provaidery_alternativy` — Rental guarantee:
  types, providers (Porto Seguro / SURA / Mapfre / ANDA / owner guarantee), how approval scores
  rent-to-income, premium, and the no-guarantee deposit route. Existing cards named providers but
  never explained the mechanics.
- `card.real_estate_purchase.reference.ref_rashody_pokupki_itp_escribano` — Purchase costs with
  concrete figures grounded in the source chat: ITP ≈ 2% of cadastral value per side, escribano
  ≈ 3% + IVA 22% (+ Montepío / Gremial), inmobiliaria ≈ 3% + IVA, the first-home ITP exemption,
  en pozo / fideicomiso. The published purchase layer had only qualitative cost cards.
- `card.real_estate_purchase.reference.ref_proishozhdenie_sredstv_bank` — Origen de fondos / AML:
  why banks and the escribano ask for source of funds on a purchase or large transfer, and how to
  prepare. (`"происхождение средств"` ×17 in source.)

The rent rent-to-income "≈3×" figure is the noisiest claim (community chatter mixes it with
price comparisons), so it is explicitly hedged. All quantitative claims are `needs_review` +
`staleness_risk: high` and say "verify with a contador / escribano / DGI".

## 2026-06-19 — New editorial cards: tax residency + foreign-income tax holiday

Content review of `taxes_accounting_empresa` (RU cards vs `claims.jsonl` / `clean_messages.jsonl`)
found a real gap: tax residency and the foreign-income **tax holiday** for new residents — the
single most-discussed tax topic for this audience (`"налоговые каникулы"` 8 claims, `"tax holiday"`
5, `"освобождение от налог"` 12) — were covered by **0 of 21** taxes cards (which only cover empresa
formation). Added 3 public cards (RU authored as source of truth + EN/ES/DE):

- `card.taxes_accounting_empresa.reference.ref_nalogovoe_rezidentstvo` — Tax residency & foreign
  income (183-day test, centre of interests, investment route; Uruguayan-source vs foreign; the
  remote-work catch).
- `card.taxes_accounting_empresa.reference.ref_nalogovye_kanikuly` — The tax holiday (temporary
  exemption vs reduced flat rate; what income qualifies). Figures hedged + `needs_review`.
- `card.taxes_accounting_empresa.warning.nalogovye_kanikuly_protiv_empresa` — Pitfalls: "zero tax"
  myth, local activity/empresa breaks the holiday, deadlines, excluded assets.

- **Infrastructure**
  - `scripts/lib/apply-new-cards.mjs` (new) — appends cards from `new-cards.json` to `cards` + all
    four locales; derives i18n keys from `card_id`; derives `search_text`; skips id collisions.
  - `dataset-patches/new-cards.json` (new) — the 3 cards, all metadata + 4-locale text inline.
  - `scripts/deploy.mjs` — applies new cards after overrides; `source_hash` now covers raw +
    overrides + new cards. Dry-run: 265 → **268 cards** (123 public+active), +12 translations.
  - `scripts/build-dataset-version.mjs` — folds new cards into the baked dataset too (regenerates
    `kb_cards.json` + `locale_ru.json`); aborts on id collision.
- Quantitative tax claims are `needs_review` + `staleness_risk: high` and explicitly say "verify
  with a contador / DGI" (community figures vary: 5 / 10 / 11 years, ~7–12%).

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
