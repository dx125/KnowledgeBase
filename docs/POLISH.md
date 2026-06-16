# Polish Plan — dataset v5.7 (`kb_dataset_uy_v5_7_semantic_aligned`)

The current implementation runs against v5.7 **with zero required code changes for
correctness** (deploy dry-run passes: 457 cards, **180** public+active, 5852 translations,
1264 alias rows). The v5.5 raw-entity-ID regression was fixed in v5.6, so **Finding G is no
longer needed**. Everything below is optional polish.

Work in this order. P0 is operational; P1 are ~5-line wins; P2 is the one real feature.

| # | Priority | Finding | Effort |
|---|---|---|---|
| E | **P0** | Re-point to v5.7 and redeploy | trivial |
| ~~G~~ | ✅ done | Strip leaked IDs — **resolved by dataset v5.6**; no longer needed | — |
| B | P1 | Treat `public_overview` as a landing card | small |
| C | P1 | Prefer top-level `confidence_score` | tiny |
| D | P1 | Control synonym over-expansion (use `origin` field) | small |
| H | P1 | Use `semantic_alignment.alignment_score` as a ranking/quality signal | small |
| A | P2 | Related glossary / resources / entities panel | feature |
| I | **TODO** | Accent-insensitive search (`unaccent`) | small |
| F | — | Body templating (dataset-side; regressed in v5.7 — see note) | n/a |

After **any** change touching SQL, re-apply the changed migration(s); after deploy
changes, run `npm run deploy -- --dry-run`; after web changes, `npm run build`; after
the Edge Function, `node web/node_modules/esbuild/bin/esbuild supabase/functions/kb/index.ts`.

---

## E (P0) — Re-point to v5.5 and redeploy

This alone delivers the v5.2–v5.5 dataset fixes (overview cards resolve, more specific public
bodies, top-level `confidence_score`, rich locale synonyms, full glossary/resource/entity links).

1. Edit root `.env`:
   ```
   DATASET_DIR=C:/Users/alezd/Downloads/kb_dataset_uy_v5_5_curated/kb_dataset_uy_v5_5_curated
   ```
2. From `scripts/`: `npm run deploy -- --label "v5.7"` (migrations already applied; deploy
   is a full atomic replace).

**Acceptance:** deploy prints `457 cards (180 public+active) · 97 subtopics · 889 keywords ·
5852 translations · 1264 alias rows`. Every topic shows a non-blank public overview card; a
search for a glossary/entity alias (e.g. `electricidad`) returns expected cards; **no** public
card body shows a raw `entity.`/`term.` token (fixed in v5.6).

---

## B (P1) — Treat `public_overview` as a landing card

v5.4 has 3 landing-style types now: `summary` (mostly internal) and the 20 public
`public_overview` cards. Today only `summary` gets "first + highlighted" treatment;
overview cards rely implicitly on their high `search_boost` (1.35) to sort first. Make it explicit.

**1. `supabase/migrations/0002_functions.sql` — `get_topic_cards`** order-by:
```sql
-- before:
order by (c.card_type = 'summary') desc, c.search_boost desc nulls last, c.quality_score desc nulls last, c.card_id;
-- after:
order by (c.card_type in ('summary','public_overview')) desc, c.search_boost desc nulls last, c.quality_score desc nulls last, c.card_id;
```
Do the same to the tiebreak in `search_cards` (`order by ... (card_type = 'summary') desc` →
`(card_type in ('summary','public_overview')) desc`).

**2. `web/src/components/CardItem.tsx`** — treat overview as a landing card for styling:
```ts
const isSummary = card.card_type === 'summary';
// →
const isLanding = card.card_type === 'summary' || card.card_type === 'public_overview';
```
Use `isLanding` wherever `isSummary` drove the indigo "landing" styling. Optionally add an
"Overview" pill for `public_overview` (new i18n key `overviewBadge`, see §A6 for the i18n pattern).

**Acceptance:** re-apply `0002`; in a topic with an internal `summary` and a public
`public_overview`, the overview card renders first and highlighted in public (toggle-off) mode.

---

## C (P1) — Prefer top-level `confidence_score`

v5.3+ exposes `confidence_score` at the top level on every card (nested
`evidence_strength.confidence_score` retained for back-compat). Prefer the top-level field.

**`scripts/deploy.mjs`** — in `cardRow()`:
```js
// before:
confidence_score: c.evidence_strength?.confidence_score ?? null,
// after:
confidence_score: c.confidence_score ?? c.evidence_strength?.confidence_score ?? null,
```
No schema change (column already exists).

**Acceptance:** `npm run deploy -- --dry-run` still builds 457 cards with no error.

---

## D (P1) — Control synonym over-expansion

The glossary is 24 curated + 206 auto-derived keyword terms. **v5.5 added explicit
`origin` (`curated` | `auto_keyword`) and `auto_generated` fields** and marked auto terms
`status:"needs_review"` (aliases also trimmed: avg 14.6 → 6.0). Use the **field**, not the
old `term.keyword.*` id-prefix heuristic. Our `search_aliases` is OR-expanded into every
query, so the auto terms can dilute **precision** — default to curated-only.

**`scripts/deploy.mjs`** — where aliases are built from glossary:
```js
const INCLUDE_AUTO_GLOSSARY = false; // v5.5: origin === 'auto_keyword'
for (const term of glossary.terms ?? []) {
  if (!INCLUDE_AUTO_GLOSSARY && term.origin === 'auto_keyword') continue;
  addGroup([term.canonical_term, ...(term.aliases ?? [])], 'glossary');
}
```
(Entities are unchanged — keep all of them; note v5.5 has 31 entities, 9 of them internal.)

**Acceptance:** dry-run alias-row count drops from v5.5's 1264 toward the curated set (24
glossary + entity groups). After a real deploy, spot-check that broad single words don't pull
unrelated cards to the top; flip `INCLUDE_AUTO_GLOSSARY` to `true` if recall matters more
than precision for your use.

---

## A (P2) — Related glossary / resources / entities panel

> **Status (v6.3): glossary + entities SHIPPED; resources now UNBLOCKED — the open follow-up.**
> The glossary/entity panel is live in `get_card` + the web app. The **resource** half was gated
> because every resource was `visibility=internal`; **v6.3 made 22 resources public with verified
> URLs** (UTE, OSE, ANTEL, BROU, DGI, …), so surfacing official org links per card is now
> actionable. Scope: `resources` + `resource_translations` + `card_resources` tables, ingest
> `visibility='public'` resources in `deploy.mjs`, add a `resources` block to `get_card` (public
> only), and a web panel row. Use `name_i18n_key`/`description_i18n_key` → `locale_<L>.resources`.

v5.4/v5.5 populated `glossary_term_ids`, `resource_ids` and `entity_ids` on cards (v5.5:
**457/457** coverage), plus localized glossary/resource/entity text in the locale files. This
unlocks a card-detail "related context" panel (previously impossible — the link

> **v5.5 caveat — resources are all `visibility=internal`.** All 31 resources are internal
> with unverified URLs. Do **not** surface resources to public (toggle-off) users; show the
> **glossary terms** (curated `origin=curated` first) and **entities** in the public panel,
> and gate resources behind the "show internal" toggle until the dataset marks some
> `visibility=public` (reported as the R3 follow-up). Filter resources/entities by their
> `visibility` when building the panel.
data was empty). Entities and resources overlap (`entity.dgi` ↔ `resource.entity.dgi`), so
surface **glossary terms + resources** in the UI and store entities for completeness.

### Verified locale-key transforms (use exactly these)
- Glossary `term.<slug>` → `locale.glossary["glossary.<slug>.title"]` and `…".definition"]`
  (slug = everything after the first `.`; resolves 230/230, incl. `term.keyword.*`).
- Resource → use the resource's own `name_i18n_key` / `description_i18n_key`
  (from `resources.json`; resolve in `locale.resources`; 22/22).
- Entity `entity.<slug>` → `locale.entities["entities.<slug>.name"]` and `…".description"]` (22/22).

### A1. Schema — new `supabase/migrations/0006_links.sql`
```sql
create table if not exists glossary_terms (
  term_id text primary key,
  status  text
);
create table if not exists glossary_translations (
  term_id text references glossary_terms(term_id) on delete cascade,
  locale  text not null, term text, definition text,
  primary key (term_id, locale)
);
create table if not exists resources (
  resource_id text primary key, type text, url text, visibility text
);
create table if not exists resource_translations (
  resource_id text references resources(resource_id) on delete cascade,
  locale text not null, name text, description text,
  primary key (resource_id, locale)
);
create table if not exists entities (
  entity_id text primary key, type text
);
create table if not exists entity_translations (
  entity_id text references entities(entity_id) on delete cascade,
  locale text not null, name text, description text,
  primary key (entity_id, locale)
);
create table if not exists card_glossary_terms (
  card_id text references cards(card_id) on delete cascade,
  term_id text references glossary_terms(term_id) on delete cascade,
  primary key (card_id, term_id)
);
create table if not exists card_resources (
  card_id text references cards(card_id) on delete cascade,
  resource_id text references resources(resource_id) on delete cascade,
  primary key (card_id, resource_id)
);
create table if not exists card_entities (
  card_id text references cards(card_id) on delete cascade,
  entity_id text references entities(entity_id) on delete cascade,
  primary key (card_id, entity_id)
);

do $$ declare t text; begin
  foreach t in array array[
    'glossary_terms','glossary_translations','resources','resource_translations',
    'entities','entity_translations','card_glossary_terms','card_resources','card_entities'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('grant select on %I to service_role;', t);
  end loop;
end $$;
```
Also add these 9 table names to the revoke/grant loop in
`0004_lock_down_direct_access.sql` (the table array) so direct anon access stays denied.

### A2. Ingest — `scripts/deploy.mjs`
Files already loaded: `glossary.json`, `entity_index.json`. **Add** `resources.json` to the
`FILES` array and `JSON.parse` it.

Build rows (only link to masters that exist — defensive against stray ids):
```js
const gSlug = (id) => id.slice(id.indexOf('.') + 1);          // term.cedula -> cedula ; term.keyword.x -> keyword.x
const eSlug = (id) => id.slice(id.indexOf('.') + 1);          // entity.ute -> ute

const glossaryTerms = glossary.terms ?? [];
const resourceList  = resources.resources ?? [];
const entityList    = entityIndex.entities ?? [];
const termSet = new Set(glossaryTerms.map((t) => t.term_id));
const resSet  = new Set(resourceList.map((r) => r.resource_id));
const entSet  = new Set(entityList.map((e) => e.entity_id));

const glossaryRows = glossaryTerms.map((t) => ({ term_id: t.term_id, status: t.status ?? null }));
const resourceRows = resourceList.map((r) => ({ resource_id: r.resource_id, type: r.type ?? null, url: r.url ?? null, visibility: r.visibility ?? null }));
const entityRows   = entityList.map((e) => ({ entity_id: e.entity_id, type: e.type ?? null }));

const glossaryTrRows = [], resourceTrRows = [], entityTrRows = [];
for (const locale of LOCALES) {
  const L = locales[locale];
  for (const t of glossaryTerms) {
    const base = `glossary.${gSlug(t.term_id)}`;
    glossaryTrRows.push({ term_id: t.term_id, locale, term: L.glossary?.[`${base}.title`] ?? null, definition: L.glossary?.[`${base}.definition`] ?? null });
  }
  for (const r of resourceList)
    resourceTrRows.push({ resource_id: r.resource_id, locale, name: L.resources?.[r.name_i18n_key] ?? null, description: L.resources?.[r.description_i18n_key] ?? null });
  for (const e of entityList) {
    const base = `entities.${eSlug(e.entity_id)}`;
    entityTrRows.push({ entity_id: e.entity_id, locale, name: L.entities?.[`${base}.name`] ?? null, description: L.entities?.[`${base}.description`] ?? null });
  }
}

const cardGlossaryRows = cards.flatMap((c) => (c.glossary_term_ids ?? []).filter((id) => termSet.has(id)).map((term_id) => ({ card_id: c.card_id, term_id })));
const cardResourceRows = cards.flatMap((c) => (c.resource_ids ?? []).filter((id) => resSet.has(id)).map((resource_id) => ({ card_id: c.card_id, resource_id })));
const cardEntityRows   = cards.flatMap((c) => (c.entity_ids ?? []).filter((id) => entSet.has(id)).map((entity_id) => ({ card_id: c.card_id, entity_id })));
```
Add to `DELETE_ORDER` (children first): `card_glossary_terms, card_resources, card_entities,
glossary_translations, resource_translations, entity_translations, glossary_terms, resources, entities`.
Insert (masters before links, in the transaction):
```js
await insertRows(client, 'glossary_terms', ['term_id','status'], glossaryRows);
await insertRows(client, 'resources', ['resource_id','type','url','visibility'], resourceRows);
await insertRows(client, 'entities', ['entity_id','type'], entityRows);
await insertRows(client, 'glossary_translations', ['term_id','locale','term','definition'], glossaryTrRows);
await insertRows(client, 'resource_translations', ['resource_id','locale','name','description'], resourceTrRows);
await insertRows(client, 'entity_translations', ['entity_id','locale','name','description'], entityTrRows);
await insertRows(client, 'card_glossary_terms', ['card_id','term_id'], cardGlossaryRows);
await insertRows(client, 'card_resources', ['card_id','resource_id'], cardResourceRows);
await insertRows(client, 'card_entities', ['card_id','entity_id'], cardEntityRows);
```

### A3. Expose on the card — `0002_functions.sql` `get_card`
Add inside the returned `jsonb_build_object` (alongside the existing `keywords`/`subtopics`):
```sql
'glossary', (
  select coalesce(jsonb_agg(jsonb_build_object(
    'term', coalesce(gt.term, gte.term),
    'definition', coalesce(gt.definition, gte.definition)) order by cg.term_id), '[]'::jsonb)
  from card_glossary_terms cg
  left join glossary_translations gt  on gt.term_id = cg.term_id and gt.locale = (select locale from loc)
  left join glossary_translations gte on gte.term_id = cg.term_id and gte.locale = 'en'
  where cg.card_id = c.card_id
),
'resources', (
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', coalesce(rt.name, rte.name), 'url', r.url, 'type', r.type) order by cr.resource_id), '[]'::jsonb)
  from card_resources cr
  join resources r on r.resource_id = cr.resource_id
  left join resource_translations rt  on rt.resource_id = cr.resource_id and rt.locale = (select locale from loc)
  left join resource_translations rte on rte.resource_id = cr.resource_id and rte.locale = 'en'
  where cr.card_id = c.card_id
)
```
(Optional: add an `entities` block the same way. No Edge Function change — `GET /cards/:id`
already returns this `get_card` JSON verbatim.)

### A4. Web — fetch + render
`web/src/lib/api.ts`: add a `getCard` call and types.
```ts
export interface GlossaryRef { term: string | null; definition: string | null }
export interface ResourceRef { name: string | null; url: string | null; type: string | null }
export interface CardDetail {
  card_id: string; title: string | null; body: string | null;
  keywords: string[]; subtopics: string[];
  glossary: GlossaryRef[]; resources: ResourceRef[];
  /* …other get_card fields as needed… */
}
export async function getCard(cardId: string, locale: string): Promise<CardDetail> {
  const data = await apiGet<{ card: CardDetail }>(`/cards/${encodeURIComponent(cardId)}`, { locale });
  return data.card;
}
```
`web/src/components/CardItem.tsx`: add a "Details" toggle that lazy-loads `getCard(card.card_id, locale)`
and renders a panel under the body:
- **Glossary** — list of `term — definition` (skip null terms).
- **Resources** — list of `name` linking to `url` (open in new tab; show `type`).
Gate rendering on non-empty arrays so cards without links show nothing extra.

### A6. i18n — `web/src/i18n.ts`
Add keys to the `StringKey` union and all four dicts (`en/ru/es/de`), following the existing
pattern (EN is the fallback). Suggested keys/values:
| key | en | ru | es | de |
|---|---|---|---|---|
| `relatedTerms` | Related terms | Связанные термины | Términos relacionados | Verwandte Begriffe |
| `relatedResources` | Resources | Ресурсы | Recursos | Ressourcen |
| `details` | Details | Подробности | Detalles | Details |
| `overviewBadge` | Overview | Обзор | Resumen | Übersicht |

> **v5.5 schema note:** add `origin` to the `glossary_terms` table (and `visibility` to
> `entities`) so the panel can show curated terms first and filter internal records. Counts
> for v5.5: ~230 glossary terms, **31** resources (all internal), **31** entities (9 internal).

### A — Acceptance
- Apply `0006` + the `0004` edit; update `deploy.mjs`; `npm run deploy -- --dry-run` reports the
  new master/link counts without error (≈230 glossary terms, 31 resources, 31 entities, and the
  card-link rows).
- `GET /cards/card.summary.bank_accounts_cards?locale=ru` returns non-empty `glossary` and
  `resources` arrays with localized text.
- In the app, opening a linked card shows the related-terms panel (resources gated to the
  internal toggle per the caveat above); an unlinked card shows none.

---

## F — Body templating (dataset-side; **regressed in v5.7**)

History: v5.3 ≈0.59 similar → v5.5 rewrite ≈0.30 (more specific) → **v5.7 rebuilt bodies from
supporting messages and they re-templated to ≈0.71** (SeqMatcher). v5.7 bodies are now
*evidence-anchored* but read as a fixed scaffold ("«X» — справочная карточка по разделу… где
повторяются смысловые опоры: <keywords>… справочную выжимку из чата…"). The card-specific part
is a keyword/anchor list, and those anchors sometimes include noisy n-grams. No app change;
this is dataset-side editorial (reported as the updated R1 / new note in
`DATASET_RECOMMENDATIONS.md`). Finding H mitigates the *ranking* impact by surfacing alignment.

---

## G — ✅ Resolved by dataset v5.6 (no longer needed)

The v5.5 raw-`entity.*`-ID leak was fixed by the v5.6 public-text gate; v5.7 has **0** raw-ID
tokens in public bodies (all locales). No import sanitizer required. (If you want belt-and-
suspenders, the `stripIds` helper from the prior version is a harmless no-op now — optional.)

---

## I (TODO) — Accent-insensitive search (`unaccent`)

**Observed in the v5.7 production deploy smoke test:** `search_cards('cedula', 'ru', …)`
matches only weakly (rank ~0.11, wrong card first) because the lexeme `cedula` ≠ `cédula`.
Spanish-heavy content means users routinely type terms without accents (`cedula`, `tramite`,
`numero`), so accent-insensitive matching is a real recall/precision win. Not a correctness
blocker — search still works for accented/exact input.

**Plan (DB-side, one migration + redeploy):**
1. New migration (e.g. `0007_unaccent.sql`): `create extension if not exists unaccent;`
   Note: `unaccent` is **not** `immutable` by default, so it can't be used directly inside the
   generated/indexed tsvector expression. Wrap it in an `immutable` SQL helper:
   ```sql
   create or replace function kb_unaccent(text) returns text
     language sql immutable parallel safe as $$ select public.unaccent('public.unaccent', $1) $$;
   ```
2. In `0001_schema.sql` `card_translations_tsv()` trigger, wrap each text field:
   `to_tsvector(cfg, kb_unaccent(coalesce(new.title,'')))`, etc. Re-apply `0001` and **redeploy
   the data** (the trigger only rewrites `search_vector` on insert/update, so a full atomic
   replace is the simplest way to rebuild every row's vector).
3. In `0002_functions.sql` `search_cards`, unaccent the query the same way before
   `websearch_to_tsquery` / the trigram comparison so query and index agree.
4. Optionally extend trigram indexes/comparisons to `kb_unaccent(title)` for fuzzy matches too.

**Acceptance:** after redeploy, `search_cards('cedula', …)` returns the cédula/identity card at
top rank (parity with `search_cards('cédula', …)`); existing accented queries are unchanged.

---

## H (P1) — Use `semantic_alignment.alignment_score` as a ranking/quality signal

v5.7 added `semantic_alignment` (with `alignment_score` 0–1) to every card — how well a card's
text is backed by its supporting messages (avg 0.944; the weakest public cards sit ~0.43).
Surface it so weakly-supported cards don't outrank well-supported ones.

1. **`scripts/deploy.mjs`** `cardRow()`: read it into a column —
   `alignment_score: c.semantic_alignment?.alignment_score ?? null,`
   (add `alignment_score numeric` to the `cards` table in `0001_schema.sql` + the insert column list).
2. **`0002_functions.sql`** `search_cards`: fold into rank, e.g. multiply the score by
   `(0.7 + 0.3 * coalesce(alignment_score, 1))` so low-alignment cards are gently demoted; and
   optionally return it so the UI can show a small "evidence-backed" indicator.
3. Optional UI: a subtle badge when `alignment_score < 0.5` ("limited evidence").

**Acceptance:** dry-run builds 457 cards; a known weak card ranks below a strong card for the
same query.

---

## Suggested execution order
1. **E** (redeploy v5.7) — validate the baseline (no leaked IDs; 180 public).
2. **B, C, D, H** together (small, independent; re-apply `0001`/`0002` for B/H, deploy for C/D/H).
3. **A** (feature) — schema `0006` + `0004` edit + deploy ingest + `get_card` + web panel + i18n.
4. Re-run the standard checks: `npm run deploy -- --dry-run`, `npm run build`,
   `esbuild …/kb/index.ts`, and apply changed migrations.
