-- =============================================================================
-- Uruguay Knowledge Base — search & browse RPCs (v5)
--
-- Scope (p_include_internal):
--   * false (default) → only visibility='public' AND status='active' (public UI)
--   * true            → all cards (signed-in "show internal/unreviewed" mode)
--
-- Locale: explicit → user default (resolved in the Edge Function) → 'ru';
--   invalid → 'en'. Per-row EN fallback if a translation is missing.
-- =============================================================================

create or replace function kb_effective_locale(p_locale text)
returns text
language sql
immutable
as $$
  select case when p_locale in ('ru','en','es','de') then p_locale else 'en' end;
$$;

-- Expand a free-text query with synonym/cross-lingual forms from search_aliases.
-- Returns the original query plus any matched expansions, joined for tsquery use.
create or replace function kb_expand_query(p_query text, p_locale text)
returns text
language sql
stable
as $$
  with toks as (
    select distinct lower(tok) as tok
    from regexp_split_to_table(coalesce(p_query, ''), '\s+') as tok
    where length(tok) > 1
  ),
  exp as (
    select distinct a.expansion
    from search_aliases a
    join toks t on lower(a.alias) = t.tok
    where a.locale is null or a.locale = p_locale
  )
  select trim(coalesce(p_query, '') || ' ' || coalesce(string_agg(expansion, ' '), ''))
  from exp;
$$;

-- ---------------------------------------------------------------------------
-- list_topics — topics that have at least one card in scope, richest first.
-- ---------------------------------------------------------------------------
create or replace function list_topics(p_locale text default 'ru', p_include_internal boolean default false)
returns table (
  topic_id            text,
  card_count          int,
  clean_message_count int,
  sensitivity         text,
  title               text,
  description         text
)
language sql
stable
as $$
  with loc as (select kb_effective_locale(p_locale) as locale),
  counts as (
    select c.topic_id, count(*)::int as card_count
    from cards c
    where p_include_internal or (c.visibility = 'public' and c.status = 'active')
    group by c.topic_id
  )
  select
    t.topic_id,
    cn.card_count,
    t.clean_message_count,
    t.sensitivity,
    coalesce(tt.title, tte.title),
    coalesce(tt.description, tte.description)
  from counts cn
  join topics t on t.topic_id = cn.topic_id
  left join topic_translations tt  on tt.topic_id = t.topic_id and tt.locale = (select locale from loc)
  left join topic_translations tte on tte.topic_id = t.topic_id and tte.locale = 'en'
  order by cn.card_count desc, coalesce(tt.title, tte.title);
$$;

-- ---------------------------------------------------------------------------
-- get_topic_cards — cards in a topic (summary first, then by search_boost/quality).
-- ---------------------------------------------------------------------------
create or replace function get_topic_cards(
  p_topic_id text,
  p_locale text default 'ru',
  p_include_internal boolean default false
)
returns table (
  card_id          text,
  card_type        text,
  status           text,
  visibility       text,
  title            text,
  short_body       text,
  body             text,
  confidence       text,
  staleness_risk   text,
  needs_review     boolean,
  sensitivity_tags text[],
  quality_score    numeric,
  alignment_score  numeric,
  last_updated     timestamptz
)
language sql
stable
as $$
  with loc as (select kb_effective_locale(p_locale) as locale)
  select
    c.card_id, c.card_type, c.status, c.visibility,
    coalesce(ct.title, cte.title),
    coalesce(ct.short_body, cte.short_body),
    coalesce(ct.body, cte.body),
    c.confidence, c.staleness_risk, c.needs_review, c.sensitivity_tags,
    c.quality_score, c.alignment_score, c.last_updated_from_message_date
  from cards c
  left join card_translations ct  on ct.card_id = c.card_id and ct.locale = (select locale from loc)
  left join card_translations cte on cte.card_id = c.card_id and cte.locale = 'en'
  where c.topic_id = p_topic_id
    and (p_include_internal or (c.visibility = 'public' and c.status = 'active'))
  -- B: topic landing cards (summary / public_overview) first
  order by (c.card_type in ('summary','public_overview')) desc,
           c.search_boost desc nulls last, c.quality_score desc nulls last, c.card_id;
$$;

-- ---------------------------------------------------------------------------
-- search_cards — ranked, synonym-expanded search.
-- ---------------------------------------------------------------------------
create or replace function search_cards(
  p_query    text,
  p_locale   text default 'ru',
  p_topic_id text default null,
  p_limit    int  default 20,
  p_offset   int  default 0,
  p_include_internal boolean default false
)
returns table (
  card_id          text,
  topic_id         text,
  card_type        text,
  status           text,
  visibility       text,
  title            text,
  short_body       text,
  body             text,
  confidence       text,
  staleness_risk   text,
  needs_review     boolean,
  sensitivity_tags text[],
  quality_score    numeric,
  alignment_score  numeric,
  last_updated     timestamptz,
  topic_title      text,
  rank             real,
  total_count      bigint
)
language sql
stable
as $$
  with
  loc as (select kb_effective_locale(p_locale) as locale),
  cfg as (select kb_regconfig((select locale from loc)) as rc),
  q as (
    select
      websearch_to_tsquery((select rc from cfg),
        kb_expand_query(coalesce(p_query, ''), (select locale from loc))) as tsq,
      nullif(trim(coalesce(p_query, '')), '') as raw
  ),
  base as (
    select
      c.card_id, c.topic_id, c.card_type, c.status, c.visibility,
      c.confidence, c.staleness_risk, c.needs_review, c.sensitivity_tags,
      c.quality_score, c.alignment_score, c.search_boost,
      c.last_updated_from_message_date as last_updated,
      coalesce(ct.title, cte.title)           as title,
      coalesce(ct.short_body, cte.short_body) as short_body,
      coalesce(ct.body, cte.body)             as body,
      coalesce(ct.search_vector, cte.search_vector) as search_vector,
      coalesce(tt.title, tte.title)           as topic_title
    from cards c
    left join card_translations ct  on ct.card_id = c.card_id and ct.locale = (select locale from loc)
    left join card_translations cte on cte.card_id = c.card_id and cte.locale = 'en'
    left join topic_translations tt  on tt.topic_id = c.topic_id and tt.locale = (select locale from loc)
    left join topic_translations tte on tte.topic_id = c.topic_id and tte.locale = 'en'
    where (p_include_internal or (c.visibility = 'public' and c.status = 'active'))
      and (p_topic_id is null or c.topic_id = p_topic_id)
  ),
  scored as (
    select
      b.*,
      case
        when (select raw from q) is null then 0::real
        else (ts_rank(b.search_vector, (select tsq from q))
              + 0.3 * greatest(
                  similarity(coalesce(b.title, ''),      (select raw from q)),
                  similarity(coalesce(b.short_body, ''), (select raw from q))
                ))
             * (1 + coalesce(b.search_boost, 0))             -- per-card editorial boost
             * (0.7 + 0.3 * coalesce(b.alignment_score, 1))  -- H: gently demote weakly evidence-backed cards
      end as rank
    from base b
  ),
  filtered as (
    select * from scored
    where (select raw from q) is null
       or search_vector @@ (select tsq from q)
       or rank > 0.10
  )
  select
    card_id, topic_id, card_type, status, visibility, title, short_body, body,
    confidence, staleness_risk, needs_review, sensitivity_tags, quality_score,
    alignment_score, last_updated, topic_title, rank,
    count(*) over () as total_count
  from filtered
  order by
    case when (select raw from q) is null then 0 else 1 end,
    rank desc,
    (card_type in ('summary','public_overview')) desc,
    card_id
  limit greatest(coalesce(p_limit, 20), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- ---------------------------------------------------------------------------
-- get_card — single card detail incl. localized keywords & subtopics.
-- ---------------------------------------------------------------------------
create or replace function get_card(p_card_id text, p_locale text default 'ru')
returns jsonb
language sql
stable
as $$
  with loc as (select kb_effective_locale(p_locale) as locale)
  select jsonb_build_object(
    'card_id',          c.card_id,
    'topic_id',         c.topic_id,
    'card_type',        c.card_type,
    'status',           c.status,
    'visibility',       c.visibility,
    'confidence',       c.confidence,
    'staleness_risk',   c.staleness_risk,
    'needs_review',     c.needs_review,
    'sensitivity_tags', c.sensitivity_tags,
    'sensitivity_level',c.sensitivity_level,
    'quality_score',    c.quality_score,
    'confidence_score', c.confidence_score,
    'last_confirmed_date', c.last_confirmed_date,
    'stale_after_days', c.stale_after_days,
    'last_updated',     c.last_updated_from_message_date,
    'source_stats',     c.source_stats,
    'title',            coalesce(ct.title, cte.title),
    'short_body',       coalesce(ct.short_body, cte.short_body),
    'body',             coalesce(ct.body, cte.body),
    'topic_title',      coalesce(tt.title, tte.title),
    'keywords', (
      select coalesce(jsonb_agg(coalesce(kt.term, kte.term) order by ck.keyword_id), '[]'::jsonb)
      from card_keywords ck
      left join keyword_translations kt  on kt.keyword_id = ck.keyword_id and kt.locale = (select locale from loc)
      left join keyword_translations kte on kte.keyword_id = ck.keyword_id and kte.locale = 'en'
      where ck.card_id = c.card_id
    ),
    'subtopics', (
      select coalesce(jsonb_agg(coalesce(st.title, ste.title) order by cs.subtopic_id), '[]'::jsonb)
      from card_subtopics cs
      left join subtopic_translations st  on st.subtopic_id = cs.subtopic_id and st.locale = (select locale from loc)
      left join subtopic_translations ste on ste.subtopic_id = cs.subtopic_id and ste.locale = 'en'
      where cs.card_id = c.card_id
    ),
    -- Related context: curated glossary terms only (auto_keyword are noisy/needs_review).
    'glossary', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'term',       coalesce(gt.term, gte.term),
        'definition', coalesce(gt.definition, gte.definition)) order by cg.term_id), '[]'::jsonb)
      from card_glossary_terms cg
      join glossary_terms g on g.term_id = cg.term_id and g.origin = 'curated'
      left join glossary_translations gt  on gt.term_id = cg.term_id and gt.locale = (select locale from loc)
      left join glossary_translations gte on gte.term_id = cg.term_id and gte.locale = 'en'
      where cg.card_id = c.card_id and coalesce(gt.term, gte.term) is not null
    ),
    'entities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'name', coalesce(et.name, ete.name, e.name),
        'type', e.type) order by ce.entity_id), '[]'::jsonb)
      from card_entities ce
      join entities e on e.entity_id = ce.entity_id
      left join entity_translations et  on et.entity_id = ce.entity_id and et.locale = (select locale from loc)
      left join entity_translations ete on ete.entity_id = ce.entity_id and ete.locale = 'en'
      where ce.card_id = c.card_id and coalesce(et.name, ete.name, e.name) is not null
    )
  )
  from cards c
  left join card_translations ct  on ct.card_id = c.card_id and ct.locale = (select locale from loc)
  left join card_translations cte on cte.card_id = c.card_id and cte.locale = 'en'
  left join topic_translations tt  on tt.topic_id = c.topic_id and tt.locale = (select locale from loc)
  left join topic_translations tte on tte.topic_id = c.topic_id and tte.locale = 'en'
  where c.card_id = p_card_id;
$$;

-- Functions are reachable only by the API role (service_role); see 0004.
grant execute on function kb_effective_locale(text)                       to service_role;
grant execute on function kb_expand_query(text, text)                     to service_role;
grant execute on function list_topics(text, boolean)                      to service_role;
grant execute on function get_topic_cards(text, text, boolean)            to service_role;
grant execute on function search_cards(text, text, text, int, int, boolean) to service_role;
grant execute on function get_card(text, text)                            to service_role;
