# Dataset localization report — `kb_dataset_uy` (audited on v6.4.2)

> ## ✅ RESOLVED in v6.5 (v6.5.2)
> The dataset team rebuilt EN/ES/DE for all the fields below and added a hard localization gate.
> Re-audited on `kb_dataset_uy_v6_5_localized`: **all P0 card fields and P1 glossary/resource
> fields now pass** — 0% Cyrillic (after the loanword whitelist), 0% placeholders, `en`/`es`/`de`
> mutually distinct, and ≠ the RU source. Verified live (deployed v6.5.2): e.g.
> *"Banks, accounts and cards: what to know"* / *"Bancos, cuentas y tarjetas: lo esencial"* /
> *"Banken, Konten und Karten: das Wichtigste"*, and per-language search works (an English query
> returns English-titled cards). `glossary.title` stays ~78% identical across locales — expected,
> those are terms/proper nouns (*cédula*, *DGI*). The detail below is kept for history.

For the dataset developer. **No application knowledge needed** — this is entirely about the
`locale_ru.json` / `locale_en.json` / `locale_es.json` / `locale_de.json` files and the i18n
keys they contain. The downstream app already passes the selected locale to every request and
renders whatever text the locale file returns; the issue is that **most reader-facing card text
in EN/ES/DE is not actually translated** — it is Russian (the RU source) or a generic English
placeholder. RU is fully populated and is the editorial source of truth.

## How this was measured

For every localized field, across all 4 locales, we checked:
1. **Cyrillic presence** — a value in `en`/`es`/`de` that contains Cyrillic letters
   (`[Ѐ-ӿ]`) is Russian, i.e. untranslated. (Loanwords kept in Latin like *cédula*,
   *empresa*, *BROU* are fine — see "Allowed exceptions".)
2. **Cross-locale identity** — whether `en`==`es`==`de` (they share one untranslated draft) and
   whether `en`==`ru` (the non-RU value is just a copy of the source).

## Summary verdict

| Field (entries) | Status | Evidence |
|---|---|---|
| **`cards.title`** (265) | ❌ **Not translated** — Russian; `en`=`es`=`de` identical (one shared draft) | en/es/de = `"Главные советы — Аренда жилья"` while ru = `"Главные советы по аренде жилья"` |
| **`cards.body`** (265) | ❌ **Not translated** — 100% Russian in en/es/de | en body = `"Банковские вопросы в Уругвае…"` |
| **`cards.short_body`** (265) | ❌ **Not translated** — ~45% Russian, ~55% an English **placeholder** | placeholder literal: `"Internal draft; Russian working reference text below."` |
| **`cards.search`** (265) | ❌ **Not translated** — Russian; `en`=`es`=`de` identical | (search blob, all Cyrillic) |
| **`glossary.title`** (230) | ⚠️ **Mostly not translated** — ~64% Russian | partial |
| **`glossary.definition`** (230) | ⚠️ **Thin auto-stubs**, not real translations | en = `"cédula: Uruguay-specific glossary term."` vs ru = `"cédula: термин из справочника Уругвая…"` |
| **`resources.description`** (31) | ⚠️ **Generic placeholder**, not a translation of the RU content | en = `"Resource/organization extracted from useful messages. Verify contact details…"` vs ru = `"Электричество, счета, подключение и переоформление услуг UTE."` |
| `topics.title` / `topics.description` (20) | ✅ **Translated** | `Renting housing` / `Alquiler de vivienda` / `Wohnung mieten` |
| `subtopics.title` (250) | ✅ **Translated** (~92%) | `Account opening` / `Apertura de cuenta` |
| `entities.description` (22) | ✅ **Translated** (thin but real) | en = `"UTE: utility_company mentioned in useful messages."` |
| `entities.name`, `resources.name` (proper nouns) | ➖ Identical by design | `UTE`, `BROU`, `DGI` |
| `keywords.term` (~62k) | ➖ Identical / language-neutral search tokens | `brou`, `dgi`, … |

**Net:** topics, subtopics, and entity descriptions are properly localized, but the **card
layer — title, short_body, body, search — which is ~99% of what a reader sees — is Russian (or
placeholder) in all of EN/ES/DE.** That is why switching the app's language changes the UI chrome
and topic names but leaves the actual article text looking unchanged (Russian).

## What needs translating, by priority

**P0 — card text (the whole reader experience).** For all 265 cards, translate into EN/ES/DE:
- `cards.<id>.title`
- `cards.<id>.short_body`  *(today often the literal placeholder
  `"Internal draft; Russian working reference text below."` — replace with a real short summary)*
- `cards.<id>.body`
- `cards.<id>.search`  *(the search blob — translate or regenerate per language so search works
  in that language; it's currently the RU blob copied to all locales)*

Note: `en`=`es`=`de` are byte-identical for title/search (one shared draft) and the bodies are an
older RU draft — so right now **none** of the three non-RU locales has language-specific card text.

**P1 — glossary + resource descriptions.**
- `glossary.<slug>.title` and `.definition` — ~64% are still Russian; the non-Russian ones are
  one-line auto-stubs, not translations. Translate the curated terms (`origin = "curated"`) first.
- `resources.<id>.description` — replace the generic English/Spanish placeholder
  (`"Resource/organization extracted from useful messages…"`) with a real translation of the RU
  description (e.g. RU `"Электричество, счета, подключение…"` → EN `"Electricity, billing,
  connection and transfer of UTE services."`). `resources.<id>.name` is a proper noun — leave as is.

**Already good (no action):** `topics.*`, `subtopics.title`, `entities.description`. Proper-noun
fields (`entities.name`, `resources.name`, most `keywords`) are correctly identical across locales.

## Acceptance criteria (per non-RU locale `L ∈ {en, es, de}`)

For each field listed under P0/P1, a value is "translated" when:
1. It contains **no Cyrillic**, except allowed loanwords/proper nouns (see below).
2. It is **not equal to the `ru` value** (not a copy of the source).
3. `en`, `es`, `de` are **not all identical** to each other (each is its own language).
4. It is **not a placeholder** string (e.g. `"Internal draft; Russian working reference text
   below."`, `"Resource/organization extracted from useful messages…"`).

A validation gate could assert this per field and fail the build with the offending i18n keys —
analogous to the existing missing-i18n and public-safety gates.

### Allowed exceptions (do not flag)
Uruguay-specific loanwords and proper nouns are expected to appear verbatim in EN/ES/DE and may
contain non-Latin or coincide with RU: e.g. *cédula, empresa, unipersonal, gastos comunes, BROU,
BPS, DGI, UTE, OSE, ANTEL, Antel, Abitab, RedPagos*. The check should whitelist these rather than
forcing a translation.

## Quick reproduction

From the dataset folder (any version), to list untranslated card titles in EN:

```bash
node -e '
const fs=require("fs");
const en=JSON.parse(fs.readFileSync("locale_en.json","utf8")).cards;
const ru=JSON.parse(fs.readFileSync("locale_ru.json","utf8")).cards;
const cards=JSON.parse(fs.readFileSync("kb_cards.json","utf8")).cards;
let bad=0;
for(const c of cards){const v=en[c.title_i18n_key]||"";if(/[Ѐ-ӿ]/.test(v)){bad++;}}
console.log("EN card titles still containing Cyrillic:",bad,"/",cards.length);
'
```
Run for `es`/`de` and for `short_body_i18n_key`/`body_i18n_key`/`search_i18n_key` to size each gap.
