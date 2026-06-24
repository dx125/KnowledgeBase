# dataset-patches changelog

Newest first. Each entry: what changed, why, and the raw dataset version it was authored
against. See `README.md` for the reproducibility model.

## 2026-06-23 — Q&A deep-dive: +14 questions (health, transport, banking, taxes)

Second Q&A batch — deeper, detail- and number-rich answers for four high-demand topics, mined
from the chat (drug-analog apps, SUCIVE patente, Montevideo fine schedule, STM/BROU-Pospago payment,
Itaú/Santander non-resident fees, monotributo/Literal-E limits, SAS-vs-unipersonal breakpoint). Each
of the four topics goes from 4–5 to **8 questions**; dataset → **388 cards** (deployed v7.1):

- **faq_health** (+4): local drug equivalents by active ingredient (Vademecum/Farmanuario), meds that
  are hard to find + how to replace them, booking (agenda) vs ER vs emergencia móvil, prescriptions
  (récipe) & pharmacy chains.
- **faq_transport** (+4): paying with STM / BROU Pospago + intercity from Tres Cruces, traffic rules
  & local driving customs (prioridad a la derecha, weak pedestrian yielding), most common fines
  (speeding in UR, parking, points), the patente car tax via SUCIVE (~5% of value, age discount).
- **faq_banking** (+3): which banks suit an immigrant vs not (Itaú/BROU/Prex vs costly non-resident
  accounts), holding costs per bank, an optimal Mastercard+Visa card setup instead of holding every bank.
- **faq_taxes** (+3): choosing & opening a company *with numbers* (monotributo ~$20k / Literal E ~$40k
  limits, SAS from ~$5k/mo), taxes & contributions per type (BPS + Fonasa, 0% export VAT, IRPF vs IRAE,
  SAS 0% IT-export profit), and running the paperwork without an accountant.

Figures are community-reported and approximate; these carry `needs_review` + high `staleness_risk`
(rates/limits change yearly) — verify with a contador / official source before acting.

## 2026-06-23 — Q&A (FAQ) section — 19 topics, 71 questions

Added a dedicated **Q&A section** (`dataset-patches/faq.json`, applied by
`scripts/lib/apply-faq.mjs`). Mined the raw chat (`messages.jsonl`, 145k msgs → 62k
question-like → 21.7k theme-classified) to rank the **most-asked questions** by theme, then
authored canonical question→answer cards grounded in that evidence + the existing KB.

- **19 new `topic.faq_*` topics** — the vendor taxonomy has no FAQ topics, so `apply-faq.mjs`
  registers them into the taxonomy + locale topic tables (the deploy then builds topic rows/
  translations as usual). Split from KB topics in clients by the `topic.faq_` id prefix.
- **71 question cards** (`content_category='faq'`, `card_type='faq'`): the question is the
  `title`, a one-line answer the `short_body`, the full answer the `body`; RU source + EN/ES/DE.
  Zero-padded card ids (`…q01_…`) give a stable per-topic order. `needs_review` (community-sourced).
- Counts per topic follow demand, not a fixed quota: residency 7, banking 5, taxes 5, rent 5,
  money/crypto 4, health 4, work 4, transport 4, documents 4, safety 4, and 2–3 each for
  property-purchase, education, locations, utilities, shopping, pets, moving, food, community.
- Because FAQ topics are first-class topics, the existing API already serves the Q&A view:
  load a topic (`GET /topics/topic.faq_*/cards`), search in it (`/search?topic=`), keyword/
  plain-text (`/search?q=`). Added an optional `/search?category=faq` scope to the Edge Function
  (filters to `topic.faq_*`; deploy with `supabase functions deploy kb`). New **Q&A web view**
  (KB | Q&A tab, topic list → question/answer accordion, search). Dataset → **374 cards** (deployed v7.0).

## 2026-06-21 — City overview cards (Montevideo, Punta del Este)

The cities that have district/zone breakdowns lacked a descriptive **general-info overview** — the
existing `ref_montevideo` / `ref_punta_del_este` cards are short advisory templates ("what's
important / what to check"), not a card that gives the reader the city's overall feel. Added 2
`content_category: overview` cards (RU source + EN/ES/DE), 4–5 sentences each, grounded in the chat:

- `card.locations_neighborhoods_living.overview.city_montevideo` — capital, ~half the country's
  population, best infrastructure; calm, stretched along the ~24 km rambla; varies sharply by barrio
  (safe coastal east vs the avoid-list), where Russian-speakers cluster, humid climate.
- `card.locations_neighborhoods_living.overview.city_punta_del_este` — the "Uruguayan Monaco"
  resort; strongly seasonal; two coasts (Mansa/Brava) + the Península; very safe but premium, with
  Maldonado/San Carlos as the cheaper year-round alternative.

Each links to its district/zone cards via `related_card_ids` and a `district_meta.districts` list
(so an app can render the overview → drill into districts). `needs_review`. Dataset → **303 cards**
(deployed v6.9). Piriápolis and the standalone towns already are their own general cards, so no
extra overview was needed there.

## 2026-06-21 — Fix formatting of the "40 practical tips" rent card

`card.real_estate_rent.advice.40` listed its 40 tips run together ~10 to a paragraph (inline
`1. … 2. … 3. …`) in **all four locales**, so it read as blocks of plain text rather than a list.
Reformatted to a clean **one-tip-per-line numbered list** (40 lines) in ru/en/es/de.

- EN/ES/DE: bodies rewritten in `card-overrides.json`.
- RU: the raw source had the same problem, so `apply-overrides.mjs` gained a narrow optional
  **`ru` block** for formatting-only fixes of the RU source. The `ru_body_hash` drift guard still
  hashes the **raw upstream** RU (`04b7a0ff`), so a future upstream change is still flagged; the
  `ru` reformat is applied after that check. Content is unchanged — only newlines were added.

## 2026-06-21 — Town guides for other frequently-mentioned towns (same model)

Extended the place-guide layer beyond the three big cities with **10 town cards** for the other
livable, frequently-discussed towns, authored the same way (reference cards under
`topic.locations_neighborhoods_living`, `district_meta` ratings folded into the searchable body,
RU source + EN/ES/DE). `new-cards.json` → 36; dataset → **301 cards** (156 public+active).
`card_id` prefix is `…reference.town_<region>_<name>`.

- **Colonia del Sacramento** (296 mentions) — safe UNESCO town, the ferry hub to Buenos Aires.
- **Atlántida / Costa de Oro** (78) — residential Canelones beach town, commuter reach of MVD.
- **San Carlos** (66) — the cheaper working town next to Maldonado/Punta.
- **Salto** (60) — interior river city, thermal springs, hot, affordable.
- **Carmelo** (33) — riverside wineries + gated communities near Colonia.
- **Minas** (32) — inland sierra town for nature-first living.
- **Punta del Diablo** (15) & **La Paloma** (12) — wild Rocha east-coast surf/fishing villages.
- **Manantiales** (9) & **Punta Ballena** (8) — distinctive upscale/scenic Punta-corridor zones.

Town/region candidates were ranked by a one-pass scan of the chat; false-positive-heavy tokens
were dropped (e.g. *durazno* = "peach", *mercedes* = car/street, *rivera* = Av. Rivera in MVD),
and tourist-only / off-grid spots not really livable (Cabo Polonio, Pan de Azúcar) were left out.
All 10 are `needs_review` / `staleness_risk: medium` (subjective community opinion).

## 2026-06-21 — New topic: per-district guides (Montevideo / Punta del Este / Piriápolis)

Added **20 district reference cards** under `topic.locations_neighborhoods_living`, taking
`new-cards.json` to 26 and the dataset to **291 cards** (146 public+active). Each card carries a
structured `district_meta` block (`id` as `<city>.<district>`, `city`, `safety_level`,
`infrastructure_level`, `price_level` ∈ high/medium/low, plus repetitive `tags`) **and** folds the
same ratings into the searchable body (RU: `Безопасность: … · Инфраструктура: … · Цены: …`), so the
facets reach `search_text` regardless of DB schema. RU is the editorial source; EN/ES/DE authored
alongside.

- **Montevideo (13):** Pocitos, Punta Carretas, Carrasco, Buceo, Malvín (with the explicit
  *avoid Malvín Norte* note), Cordón, Centro, Parque Rodó, Tres Cruces, Prado, Palermo,
  Cerro (flagged *avoid / extra caution*, with Cerrito · Casabó · La Teja), Ciudad Vieja.
- **Punta del Este / Maldonado (6):** Península, Playa Mansa, Playa Brava, La Barra,
  José Ignacio, and **Maldonado city** (the affordable year-round city vs the seasonal resort).
- **Piriápolis (1):** the quiet, safe, budget seaside town ~30 min from Punta.

All grounded in the Telegram general chat
(`Settle/tools/telegram-export/exports/general/messages.jsonl`, ~140 k messages) — ratings and
"who lives there / vibe" synthesized from per-district mention/sentence mining (e.g. the recurring
barrio-classification message, the wealth/safety voting-map, and explicit "avoid" lists). Subjective
community opinion that shifts over time, so all 20 are `needs_review: true` /
`staleness_risk: medium`.

- **Infrastructure:** `scripts/lib/apply-new-cards.mjs` now carries an optional `district_meta`
  block verbatim onto the card. No deploy-schema change (cards table has no JSONB column); the
  facets are searchable via the folded body text and the location keyword_ids.

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
