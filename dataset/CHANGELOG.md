# Dataset changelog (master timeline)

The full history of the resulting dataset — **upstream vendor releases** plus **every change we
made after taking ownership**. Newest first. This is the high-level timeline; the per-card detail
of our editorial layers is in [`../dataset-patches/CHANGELOG.md`](../dataset-patches/CHANGELOG.md),
and the deploy ledger is the `kb_data_versions` table (`GET /version`).

Version labels with `vX.Y` are our *deploy* labels (`kb_data_versions.version_label`); the raw
vendor versions are `kb_dataset_uy <semver>`.

---

## Our changes (after taking ownership of the dataset)

### Unreleased — Banking & payments cards + `service.kind` extension  · 2026-06-24
- Added **14 editorial cards** under `topic.bank_accounts_cards`: a payment-methods overview, one
  per bank (Prex, OCA, BROU, Itaú, Scotiabank, Santander), a crypto-cards hub, and per-provider
  crypto-fintech cards (RedotPay, ether.fi, Offramp, DolarApp, Tuyo, Meru). RU source + EN/ES/DE,
  each with a `service` block. Per-card detail in `../dataset-patches/CHANGELOG.md`.
- **Extended the `service.kind` enum** with `service_guide` (a how-to profile of one concrete
  service/institution) and `overview` (a domain landscape/index card), to describe this new card
  family. Updated `schemas/service.schema.json` and §4 of `SCHEMA.md`. Audit: all 156 editorial
  cards (52 new-cards + 19 FAQ topics + 85 FAQ answer-cards) carry a schema-valid `service` block;
  vendor cards remain exempt by design.

### v7.3 — Normalized Q&A (questions → cards) + service metadata + raw→v6.6  · 2026-06-24
- **Normalized the Q&A model** to match the upstream design and remove duplication: an answer now
  lives **once** as a card (the `topic.faq_*` answer-cards); a **question** is stored separately in
  `dataset-patches/questions.json` and only *references* its `answer_card_id`. New DB tables
  `questions` / `question_translations` + `list_questions` RPC (`0009_questions.sql`), `GET /questions`
  endpoint, and a reworked web Q&A view (a **global "Most asked"** list ranked by `ask_frequency`,
  plus per-topic browse).
- **ask_frequency** computed from the 145k-message chat by `scripts/build-questions.mjs` (documented,
  reproducible method) — surfaces the globally most-asked questions, not just per-topic.
- **Removed the 14 duplicate KB reference cards** added in v7.2 (their content is the FAQ answer-cards).
- **`service` block** added to every editorial card + FAQ topic (source_intent / kind / evidence).
- **Repointed `DATASET_DIR`** to `kb_dataset_uy v6.6.0-decollapsed` (the prior v6.5 raw folder was
  removed); the override layer is a verified no-op against v6.6, so totals are unchanged.
- Added the committed [`dataset/`](.) definition folder (this set of docs + MANIFEST + schemas).

### v7.2 — KB reference cards from the Q&A deep-dive (+14) · 2026-06-24 · *(reverted in v7.3)*
Mirrored the deep-dive info into the main KB topics as reference cards. Superseded by v7.3, which
keeps the FAQ cards as the single answer home.

### v7.1 — Q&A deep-dive (+14 questions) · 2026-06-24
Deeper, number-rich answers for health, transport, banking, taxes (drug analogs, SUCIVE patente,
fine schedule, bank fees, monotributo/SAS thresholds). Each of those four topics → 8 questions.

### v7.0 — Q&A (FAQ) section · 2026-06-24
Mined the chat for the most-asked questions; authored **19 `topic.faq_*` topics + 71 answer-cards**
(RU + EN/ES/DE). Added `scripts/lib/apply-faq.mjs` (registers FAQ topics + cards) and a Q&A web view.

### v6.9 — City overview cards · 2026-06-21
General-feel overviews for Montevideo and Punta del Este, linking to their district/zone cards.

### v6.7–v6.8.1 — Place guides + 40-tips fix · 2026-06-21
20 district cards (MVD/PdE/Piriápolis) and 10 standalone town cards with `district_meta`
(safety/infrastructure/price ratings + tags). Fixed the "40 practical tips" rent card, which the
vendor had flattened into run-on paragraphs, into a clean one-tip-per-line list in all four locales.

### v6.6 — De-collapse + first editorial cards · 2026-06-19
Built the baked `kb_dataset_uy v6.6.0-decollapsed` (folds `card-overrides.json` into the locale
files; idempotent under the override layer). Added the first `new-cards.json` editorial cards
(tax residency, the foreign-income tax holiday, rent garantía, purchase costs/AML).

### v6.2.1–v6.5.2 (ours) — De-collapse localization · 2026-06-16…19
The vendor's EN/ES/DE passed its "no Cyrillic" gate by collapsing ~192/265 card bodies into one
generic template per content-category. We built the **override layer** (`card-overrides.json`,
`scripts/lib/apply-overrides.mjs`) and re-translated card text from the RU source — preserving
distinct content instead of deleting apparent duplicates. Added public resources to the card panel.

### v5.7–v5.10 (ours) — Initial deploys + schema hardening · 2026-06-15
First Supabase deploys; hardened the atomic full-replace deploy; per-app token auth → redesigned to
server-to-server JWT + anon key (`docs/MOBILE_INTEGRATION.md`); added `content_category`.

---

## Upstream vendor history (the "first dataset developer")

Summarized from the raw dataset's `V*_PATCH.md` / `*_REPORT.json` and `DATASET_DOCUMENTATION.md`.

- **v6.6 — de-collapse localization.** Baked our de-collapse corrections into a clean raw build.
- **v6.5 / v6.5.2 — localization.** Regenerated EN/ES/DE for all reader-facing card/glossary/resource/
  question/topic strings from the RU editorial source; added a localization gate (Cyrillic leakage,
  placeholders, Russian-copy detection). *(Before this, EN/ES/DE were Russian or placeholder text.)*
- **v6.4 — internal card rewrite.** Non-public base + candidate cards rewritten from placeholders into
  usable internal notes.
- **v6.3 — deep reference.** Public RU cards rebuilt as detailed reference articles; official/public
  resources promoted with verified homepage URLs; private contacts kept unpublished.
- **v6.2.1 — reference-ready.** Public bodies rewritten as reader-ready articles; duplicate public
  bodies demoted to internal; high-demand topics expanded.
- **v6.1 — reader-ready rebuild.** First reader-ready public layer.
- **v5.9 / v5.10 — production candidate + rank compatibility.** Evidence-first build from clean
  messages; ranking-signal compatibility.

### Source of record
- Import batch: `batch.telegram_export_2026_06_13_messages2` — 145,049 messages
  (2023-02-13 … 2026-06-13), 58,485 clean messages. (`import_batches.json`.)
- Anti-loss layers: `clean_messages.jsonl`, `claims.jsonl`, `message_coverage_index.jsonl`.
