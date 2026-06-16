# Dataset recommendations — `kb_dataset_uy` (v5.4 → v6.2)

Feedback from a downstream consumer of the dataset. **No application knowledge is
required to act on any of this** — every recommendation and every check below refers
only to the dataset's own files (`kb_cards.json`, `locale_*.json`, `glossary.json`,
`entity_index.json`, `resources.json`, and the reports).

Locales referenced throughout: `ru`, `en`, `es`, `de`.

## Status update (v6.1 → v6.2.1)

The v6.x "reader-ready" rebuild resolves the two longest-standing recommendations. Verified
against `kb_dataset_uy_v6_2_reference_ready`:

- **R1 (deepen / de-templatize public bodies): ✅ RESOLVED in v6.2.** Public bodies are
  rewritten as practical reference articles (avg **658** chars; min 380, max 3522), **0
  duplicate public-body groups**, 0 markers/raw-IDs. **43 duplicate public cards were demoted
  to internal review**, so public+active dropped **159 → 120**. This is exactly the editorial
  pass R1 asked for. Thank you.
- **R2 (mark/trim auto-derived glossary terms): ✅ RESOLVED.** Glossary trimmed **230 → 71**
  (auto_keyword 206 → 47) with explicit `origin` retained. A consumer can rely on
  `origin='curated'` (24 terms) for synonym expansion and the related-terms panel.
- **NEW v6.2 — `content_category` gained a value: `resource_list`** (1 card). Additive and
  fine; just noting it so consumers that switch on `content_category` add a branch for it.
- **R3 follow-up still open:** resources remain `visibility=internal` with unverified URLs —
  still no publicly verified resources to surface (see R3).
- Compatibility holds: `semantic_alignment.alignment_score` (265/265, 0.64–0.91), per-card
  `search_boost` (0.27–2.60), `confidence_score`, flat i18n keys all resolve; `version` is
  still the v5.10-era semver string. R7 (duplicate `keyword_id`s) **still present** on 29 cards
  — see R7; a consumer must dedup.

## Status update (v5.8 → v5.10)

The v5.8/v5.9 "article rebuild" dropped two ranking signals that v5.7 had shipped, and v5.10
restored them. For the record, and to keep them from regressing again:

- **v5.9 regression — `semantic_alignment.alignment_score` and per-card `search_boost`
  disappeared** from every base card. v5.9's `search_weight` (a global field-weight config
  `{title,keywords,subtopics,body,linked_context}`) is **not** a substitute for the per-card
  `search_boost` scalar. **✅ Restored in v5.10** (alignment 0.640–0.905; boost 0.269–2.147),
  plus a top-level `alignment_score` alias and propagation into the search-index docs. Good —
  and the new schema/validation gate that fails if these fields vanish is exactly right.
- **NEW v5.10 — R7 (duplicate `keyword_id`s within a card).** See R7 below.
- **NEW v5.10 — `version` field changed type** from integer to a semver string (`"5.8.0"`,
  `"5.9.0"`). Not wrong per se, but it's an unannounced type change on an existing field; see
  the new R-gate item 9 (stable scalar types). A consumer storing it in a typed column has to
  migrate. Please call out field-type changes in the patch notes.

## Status update (v5.5 → v5.7)

**R1, R2, R3 and the R-gate landed in v5.5; the v5.5 regression was fixed in v5.6; v5.7 added
source/semantic alignment.** Current state:

- **R5 (raw-ID leak): ✅ RESOLVED in v5.6.** The public-text gate now blocks
  `entity.*`/`resource.*`/`term.*`/etc. in public body and search text. Verified: **0** raw-ID
  tokens in v5.7 public bodies across all four locales. The strengthened R-gate item 5 (below)
  now matches what v5.6 enforces. Thank you.
- **R3 follow-up still open:** all 31 resources remain `visibility=internal` with unverified
  URLs — no publicly verified resources yet (see R3).
- **NEW in v5.7 — body re-templating (see R1 update):** rebuilding bodies from supporting
  messages improved evidence-backing but pushed public-body similarity back **up** to ≈0.71
  (was ≈0.30 in v5.5). Bodies are now an "evidence-anchor" scaffold, and the anchor lists
  sometimes surface noisy n-grams (e.g. `дети хором советском союзе`). See R1 + R6.
- **NEW in v5.7 — R6:** noisy phrases in `support_phrase_candidates` / "смысловые опоры" lists
  reach public text. See R6.
- v5.7 added a useful `semantic_alignment` object (with `alignment_score`) to every card —
  good signal; a downstream consumer can use it for ranking. No action needed.

---

## 0. Already resolved in v5.1–v5.4 (no action needed — listed so they aren't redone)

- Public landing coverage: every top-level topic now has a public `public_overview` card.
- `public_overview` i18n keys resolve as flat lookups in all locales (was a v5.1 regression).
- `public_overview` cards carry the same operational fields as other base cards.
- Keyword synonyms are rich and language-specific (locale aliases avg ≈ 18.8 surface forms).
- Public non-overview bodies are neutral reference text — no raw chat-excerpt markers, no
  obvious PII (no emails/phones/@handles/first-person snippets).
- `confidence_score` is present top-level on every base card.
- Cards link to glossary / resources / entities (`glossary_term_ids`, `resource_ids`, `entity_ids`).

The items below are what remains.

---

## Open recommendations

### R1 — Deepen public body text (highest-value editorial item) — ✅ RESOLVED in v6.2

**Status:** **Done in the v6.x reader-ready rebuild.** Public bodies are now practical reference
articles (avg 658 chars; 0 duplicate-body groups; 0 markers/raw-IDs), and 43 duplicate public
cards were demoted to internal. History below kept for context. v5.5 reduced templating
(≈0.30), v5.7's evidence rebuild **re-templated** to ≈0.71, and v6.2 rewrote them as written
answers — which is what this item asked for.

**What:** Public, non-overview card bodies share a large boilerplate scaffold; the
card-specific content is essentially an injected keyword/anchor list. Pairwise text similarity
among the public reference bodies is high (≈0.71 in v5.7).

**Why it matters:** A reader who opens a public card gets orientation, not an answer. The
specific, actionable detail exists in the dataset but only in gated layers
(`candidate_cards.json`, `claims.jsonl`, internal cards).

**Recommendation:** Run an editorial pass that promotes reviewed detail from
candidate/claim layers into the public bodies, producing concise, *topic-specific* reference
answers — while keeping raw evidence and any sensitive/actionable specifics gated until
reviewed. Preserve the safety properties from R-gate below.

**Verify:** Re-measure average pairwise body similarity for `visibility=public & status=active &
card_type!=public_overview` cards; target a meaningfully lower average and visibly distinct,
topic-specific content. No raw-excerpt markers or PII reappear (see R-gate).

---

### R2 — Mark and quality-review auto-derived glossary terms — ✅ RESOLVED in v6.2

**Status:** `origin` was added back in v5.5, and **v6.2 trimmed the glossary 230 → 71**
(auto_keyword 206 → 47), so a consumer can rely on `origin='curated'` (24 terms). Original
request kept below for context.

**What:** `glossary.json` grew from 24 to 230 terms; **206 are auto-derived from keywords**
and are only distinguishable by their id prefix `term.keyword.*` (e.g. `term.keyword.morya`,
`term.keyword.kompanii`). All 230 carry `status:"active"`, so status does not separate
auto from curated. These auto terms average ~14.6 aliases each.

**Why it matters:** A consumer doing synonym/query expansion from the glossary can't cheaply
tell curated terms from machine-generated ones, and the broad auto terms can pull in loosely
related results. Relying on an id-prefix convention is fragile.

**Recommendation:**
1. Add an explicit field, e.g. `origin: "curated" | "auto_keyword"` (or `auto_generated: true`),
   on each glossary term, instead of encoding it in the id.
2. Lightly review the 206 auto terms: drop nonsensical ones, merge near-duplicates, and trim
   alias lists that are too broad to be useful as synonyms.

**Verify:** Every glossary term has the new origin field; the count of `auto_keyword` terms
matches the intended set; spot-checked auto terms have sensible, non-overlapping aliases.

---

### R3 — Improve resource/entity link coverage and resolve orphans

**What:** Glossary links are broad (454/457 base cards), but **resource and entity links
cover only 319/457 base cards** (and 84/181 public cards). A few vocabulary records have no
related cards at all: 2 glossary terms, 1 resource, 1 entity (per `validation_report.json`).

**Why it matters:** Resources (organizations, official links) and entities are the most
"concrete" navigational context; cards without them offer thinner related context. Orphan
records add weight without being reachable.

**Status (v5.5): applied.** Resource and entity links now cover 457/457 base cards and
181/181 public cards; no orphans. **Open follow-up:** all 31 resources are now
`visibility=internal` with no verified URLs, so a consumer has **no publicly verified
resources** to surface. Please review/verify a subset and mark them `visibility=public`
(with a verified `url`) so public cards can show at least basic official links.

---

### R5 — Remove leaked internal IDs from public body text — ✅ RESOLVED in v5.6

**Status: fixed.** v5.6 added a public-text gate; v5.7 has 0 raw-ID tokens in public bodies
across all locales. Kept here for history.

**What (was):** The v5.5 R1 rewrite appended a literal list of internal entity IDs to every
public reference body, e.g.:
> «recibo» — … Связанные ресурсы/организации: **entity.antel, entity.bbva, entity.infocasas,
> entity.dgi**, Antel, BBVA. …

Measured: raw `entity.*` ID tokens appear in **161/161** public non-overview bodies in **all
four locales**. Both the raw id and the display name are present (redundant). Overview bodies
(20) are clean.

**Why it matters:** Internal slug identifiers are not human-facing content; they look like a
bug to a reader and leak the internal ID scheme into a public surface. This is a direct
regression from v5.4 (which had no IDs in bodies).

**Recommendation:** In the body text, drop the raw `entity.*` / `term.*` / `resource.*` IDs
and keep only the resolved display names (e.g. "Antel, BBVA"), or remove the
"Связанные ресурсы/организации" line from prose entirely and rely on the structured
`entity_ids` / `resource_ids` / `glossary_term_ids` fields for linking. Apply in all locales.

**Verify:** 0 public bodies (any locale) match the regex
`\b(entity|term|kw|topic|subtopic|resource|claim)\.[a-z0-9_]+`.

---

### R6 — Filter noisy evidence anchors out of public text (NEW in v5.7)

**What:** v5.7 public bodies list "смысловые опоры" (semantic anchors /
`support_phrase_candidates`) extracted from supporting messages. Some are useful keywords, but
others are incoherent n-grams pulled from chat, e.g. a children's-doctors card lists
`дети хором советском союзе` ("children … in the Soviet Union"). These reach public text.

**Why it matters:** Noisy/irrelevant phrases in a public reference body reduce trust and look
like extraction artifacts.

**Recommendation:** Before publishing anchors, filter `support_phrase_candidates` to
single concepts / known keywords/entities/glossary terms (drop multi-word fragments that
aren't recognized terms), or omit the anchor list from public prose and keep it in metadata
only. Tie anchor inclusion to the per-phrase support score you already compute.

**Verify:** Spot-check public bodies — anchor lists contain only recognizable terms/entities,
no free-text chat fragments.

---

### R7 — De-duplicate ids within card link arrays (NEW in v5.10)

**What:** In v5.10, **29 base cards repeat a `keyword_id` inside their own `keyword_ids`
array** (31 duplicate entries total; e.g. `kw.curated.schet` listed twice on
`card.bank_accounts_cards.overview.overview`). `subtopic_ids`, `glossary_term_ids` and
`entity_ids` were clean.

**Why it matters:** A consumer that treats `(card_id, keyword_id)` as a unique link (a natural
primary key) gets a duplicate-key error on import. We worked around it by de-duping on our
side, but the arrays shouldn't carry duplicates.

**Recommendation:** De-duplicate every per-card id array (`keyword_ids`, `subtopic_ids`,
`glossary_term_ids`, `entity_ids`, and the relation arrays on candidate cards) before emitting,
and add the uniqueness check to the validation gate (R-gate item 8).

**Verify:** For every card, each id array has no repeated values
(`len(arr) == len(set(arr))`).

---

### R4 — Consolidate `confidence_score` (minor)

**What:** `confidence_score` now exists both at the top level and nested under
`evidence_strength.confidence_score` (intentional backward-compatibility).

**Recommendation:** Once consumers have migrated, pick one location (top-level recommended)
and drop the duplicate to avoid drift between the two values.

**Verify:** For every base and candidate card, top-level and nested `confidence_score` are
either identical or the redundant one is removed.

---

## R-gate — Invariants to keep enforced on every release (regression gate)

These are not new requests — they are properties that must **stay** true so any
spec-conformant consumer doesn't break. The v5.1 "blank public overview cards" incident
happened because invariant (1) silently regressed. Please keep these as hard, blocking
checks in `validation_report.json` for every future version and delta batch.

For every card in `kb_cards.json`:

1. **i18n keys resolve as flat lookups in all 4 locales.** Each of
   `title_i18n_key`, `short_body_i18n_key`, `body_i18n_key`, `search_i18n_key` exists as a
   direct key in `locale_<L>.cards` for `L ∈ {ru,en,es,de}`. (Do **not** rely on nested
   objects — a flat string lookup must succeed.)
2. **Full locale parity.** All four locales contain those keys; no locale is missing text
   that another has.
3. **Taxonomy references exist.** Every `keyword_id` and `subtopic_id` on a card exists in
   `locale_<L>.keywords` / `locale_<L>.subtopics` (all locales). Every `glossary_term_ids` /
   `resource_ids` / `entity_ids` value exists in `glossary.json` / `resources.json` /
   `entity_index.json` respectively.
4. **Required fields + allowed values.** `card_type ∈ {summary, how_to, public_overview}`,
   `status ∈ {active, needs_review, needs_expert_review}`, `visibility ∈ {public, internal}`
   are always present and within range.
5. **Public-body safety.** For `visibility=public & status=active`, the body in every locale
   contains **no** raw-excerpt marker (`Выжимка из очищенных сообщений`), no email / phone /
   `@handle` patterns, no first-person chat snippets, **and no raw internal ID tokens**
   matching `\b(entity|term|kw|topic|subtopic|resource|claim)\.[a-z0-9_]+` (this last clause
   is the gap that let the v5.5 entity-ID leak through — see R5); and is non-blank.
6. **Public coverage.** Every top-level topic has at least one `public & active` card
   (overview or summary).
7. **`confidence_score` equality.** Where both top-level and nested
   `evidence_strength.confidence_score` exist, they are identical (v5.5 already checks this).
8. **No duplicate ids in card link arrays.** For every card, each of `keyword_ids`,
   `subtopic_ids`, `glossary_term_ids`, `entity_ids` (and candidate relation arrays) has no
   repeated value — they are natural composite keys downstream (see R7, regressed in v5.10).
9. **Stable scalar field types + ranking-signal presence.** Existing fields keep their JSON
   scalar type across releases (e.g. `version` was an integer through v5.9, became a string in
   v5.10 — flag such changes in the patch notes); and `semantic_alignment.alignment_score`,
   `search_boost`, `confidence_score` are present on every base card (the v5.9 regression that
   v5.10's new gate now guards).

Each check should fail the build with the offending ids listed (the current reports already
do most of this; (1) and (5) are the ones to guard most strictly).

---

## Quick reference — markers & patterns used above

- Raw-excerpt marker string: `Выжимка из очищенных сообщений`
- Auto-derived glossary id prefix: `term.keyword.`
- Locale-key shapes (for spot checks): card text is flat (`cards.<id>.title|short|body|search`);
  glossary text is `glossary.<slug>.title|definition` (slug = term id without the `term.`
  prefix); entity text is `entities.<slug>.name|description`; resource text uses each
  resource's own `name_i18n_key` / `description_i18n_key`.
