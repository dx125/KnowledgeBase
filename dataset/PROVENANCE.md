# Provenance, decisions & lessons

Why the dataset is built the way it is, the **mistakes and issues we hit and how we resolved them**,
and how to regenerate each piece. This is the institutional memory that a schema dump alone can't
carry — read it before changing the build.

## Core design decisions (and why)

- **Raw dataset is read-only; all our changes are git-owned patch layers.** A new raw drop must not
  silently wipe our work. So we never edit raw files; `deploy.mjs` re-applies the layers on every
  deploy. Trade-off: the layers must stay FK-tolerant (unresolved link ids are dropped, not fatal).
- **RU is the editorial source of truth; EN/ES/DE are authored alongside.** The vendor only reviewed
  RU. Overrides therefore correct EN/ES/DE; RU is touched only for formatting fixes (with a drift
  guard), never content — so a future raw RU change is always detectable.
- **Atomic full-replace deploy.** One transaction does delete-all → insert-all → version row.
  Readers keep seeing the previous version until COMMIT. This makes deploys safe to re-run and lets
  the dataset express deletions/renames, not just edits. Cost: a deploy rewrites everything (~15s).
- **The answer lives once, as a card; questions reference it (v7.3).** Mirrors the upstream
  `questions.json` model and removes duplicated answer text. `ask_frequency` on the question lets us
  rank the globally most-asked questions across topics.
- **Service / regeneration intent on editorial cards.** Each authored card says, in one
  non-localized line, *what question it answers / how to rebuild it* — so the editorial layer can be
  regenerated with intent, not reverse-engineered from prose. Vendor cards already have this via the
  claims → clean_messages evidence chain.
- **No JSON column on `cards`.** Structured metadata that must be *searchable today* (e.g. district
  ratings) is also folded into the card body so it reaches `search_text`. `district_meta` is carried
  in the source JSON for downstream use.

## Mistakes & issues we hit (and the fix)

- **Vendor "no-Cyrillic" gate collapsed EN/ES/DE.** The vendor passed its localization gate by
  replacing ~192/265 non-RU card bodies with one generic template per content-category, so cards
  looked duplicated. *Fix:* the override layer — re-translate from RU instead of deleting the
  apparent duplicates. (This was the single biggest body of work; see v6.2.1–v6.5.2.)
- **EN/ES/DE were Russian/placeholder before v6.5.** Caught by adding a localization gate
  (Cyrillic leakage / placeholder / Russian-copy detection) to the vendor's validation.
- **"40 practical tips" card was a run-on paragraph in every locale.** The vendor flattened a
  numbered list into inline `1. … 2. …` text. *Fix:* reformat to one-tip-per-line; this also forced
  adding the optional RU-formatting override path (formatting-only, drift guard still on raw RU).
- **Q&A answers were duplicated (v7.0–v7.2).** We first built FAQ as question-cards with the answer
  embedded, then *also* mirrored 14 of them into KB reference cards — duplicate answer text in two
  places. *Fix (v7.3):* normalize to questions→cards; the FAQ card is the single answer home; the 14
  KB duplicates were removed.
- **`DATASET_DIR` pointed at a deleted folder.** The v6.5 raw folder was removed once v6.6 existed,
  so a deploy failed with `ENOENT kb_cards.json`. *Fix:* repoint `DATASET_DIR` to the v6.6 folder
  (the override layer is a verified no-op against v6.6, so totals are unchanged). This is the normal
  "new raw drop" path — see `dataset/README.md`.
- **Deploys with a null `version_label`.** Forgetting `--label` leaves an unlabeled ledger row.
  *Fix:* always pass `--label "vX.Y …" --notes "…"`; re-deploy (idempotent) to add a labeled row.
- **`node -e` / temp scripts couldn't resolve `node_modules`.** `pg` / `dotenv` only resolve from the
  repo dir. *Fix:* write throwaway DB scripts into `scripts/` and run them from there; never from
  `d:/tmp` or via a relative `node -e` started elsewhere.
- **A JS string broke a generator** (an inner double-quote — `"yellow"` — inside a double-quoted
  literal). *Fix:* author multi-line card text with template literals or single quotes; better, keep
  authored text in JSON (validated) rather than JS string literals.
- **LF→CRLF git warnings on Windows** are benign (autocrlf); ignore them.

## Security caveats (do not regress)

- **`.env` holds real secrets and is git-ignored — never commit or stage it.** `DATABASE_URL` and
  `VITE_SUPABASE_URL` belong to Supabase project ref **`bzqpqncoeilhzukohynz`**.
- **`SUPABASE_SERVICE_ROLE_KEY` must never reach a client and never be prefixed `VITE_`.** A past
  issue: the configured service_role key was for the *wrong* project ref — always verify the key
  matches `bzqpqncoeilhzukohynz`.
- Only the Edge Function (service_role) touches Postgres; RLS denies anon/authenticated. Clients send
  the anon key + a user JWT. The anon key is public; the service_role key is not.
- Private contacts (personal phone numbers, etc.) are **not** published unless verified and
  consent-safe; resource cards list official sites/organizations/specialist types instead.

## Anti-loss / how to regenerate each layer

- **Raw vendor dataset** — recreate with `scripts/build-dataset-version.mjs` (folds
  `card-overrides.json` into the locale files, regenerates the manifest). Its own anti-loss evidence
  (`claims.jsonl` + `clean_messages.jsonl`) lets the vendor cards be rebuilt from source messages.
- **`card-overrides.json`** — authored from the RU source; `ru_body_hash` flags RU drift via
  `scripts/check-overrides.mjs`.
- **`new-cards.json` / `faq.json`** — editorial, authored from chat synthesis; each card's `service`
  block records the regeneration intent.
- **`questions.json`** — fully regenerable: `node scripts/build-questions.mjs` recomputes
  `ask_frequency` from the raw chat and re-emits the file (preserving values if the chat is absent).
- **`dataset/MANIFEST.json`** — `node scripts/build-manifest.mjs` (hashes + counts of every layer).

## Known limitations (carry forward)

- Only RU is editorially reviewed; EN/ES/DE should be human-reviewed before a multilingual launch.
- Sensitive legal/tax/banking/immigration/medical content (incl. the number-rich Q&A answers) is
  community-sourced and **approximate** — it carries `needs_review` + high `staleness_risk` and tells
  the reader to confirm with a specialist/official source. Figures (fines, taxes, fees, thresholds)
  change yearly.
- `ask_frequency` is a relative-demand signal (overlapping keyword counts), not an exact tally.
