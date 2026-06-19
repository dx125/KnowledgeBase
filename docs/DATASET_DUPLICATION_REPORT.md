# Dataset duplication report — apparent duplicates were a translation artifact

> ## ✅ RESOLVED (override layer, 2026-06-19)
> All 265 cards now have faithful EN/ES/DE translations (`dataset-patches/card-overrides.json`).
> No cards were deleted. Verified live: 265 distinct bodies per locale, 0 collapsed bodies.

## The report

The cards **looked** duplicated in the web app — many cards in a topic showed the same header
and the same body (e.g. every `reference` card read *"reference: reference note"*; every
`advice` card showed the same bullet list). At first glance this looked like ~131 duplicate
cards across the 20 topics.

**They were not duplicates.** The duplication existed only in EN/ES/DE, not in the source.

### Evidence

Grouping cards by `(topic, EN title)` and hashing bodies showed, in every group:

```
enBodyHashes = 1 distinct   ← all cards in the group share ONE English body
ruBodyHashes = N distinct   ← but each card has its OWN Russian body
```

Measured over all 265 cards (raw v6.5 dataset):

| | RU | EN | ES | DE |
|---|---|---|---|---|
| distinct bodies | 265 | 132 | 132 | 132 |
| cards sharing a body with another | 0 | 192 | 192 | 192 |

So 192 of 265 cards were collapsed onto 132 shared EN/ES/DE bodies, while RU kept all 265
distinct. The vendor's v6.5 build passed its "no Cyrillic" localization gate by substituting
**one generic template per content-category** instead of translating each card.

### Why we did not delete

Deleting the "duplicates" would have destroyed distinct Russian content. For example, in the
rent topic the six `reference` cards are different articles in RU — *Поиск жилья* (finding
housing), *Гарантия и депозит* (guarantee & deposit), *Gastos comunes*, *Договор и въезд*
(contract & move-in), *Состояние жилья* (condition), *Сезонность* (seasonality) — that all
shared the broken EN title *"reference: reference note"*.

### What we did instead

Translated every card from the RU source into EN/ES/DE (title/short/body) and stored the
result as a reproducible, git-tracked override layer (`dataset-patches/`, applied at deploy
time). RU is untouched (editorial source of truth). `search_text` is re-derived per card from
the translated fields so per-language search keeps working.

There was a small genuinely-redundant sub-layer (auto-generated `<topic>.<category>.<category>`
stub cards that overlap a named sibling even in RU). The owner chose **translate everything,
delete nothing**, so these were kept and translated as distinct cards rather than removed.

## Reproduce the measurement

```bash
node scripts/check-overrides.mjs   # reports still-collapsed EN/ES/DE bodies (now 0)
```
