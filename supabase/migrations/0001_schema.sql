-- =============================================================================
-- Uruguay Knowledge Base — schema (dataset v5: kb_dataset_uy_v5_quality)
--
-- Design notes:
--  * Cards are language-independent (stable slug IDs). All display text lives in
--    *_translations tables keyed by (entity_id, locale).
--  * v5 cards carry access control (visibility public/internal, status
--    active/needs_review/needs_expert_review) and richer metadata (quality,
--    evidence strength, validity). Public UI = visibility='public' AND
--    status='active'; signed-in users may opt into internal/unreviewed cards.
--  * Full-text search uses a per-locale tsvector built with the matching Postgres
--    text-search configuration; pg_trgm adds typo tolerance. Synonym/cross-lingual
--    matching comes from the curated per-card `search` text plus query expansion
--    over `search_aliases` (glossary + entity aliases).
--  * No direct client access: only the service_role (Edge Function + deploy) can
--    read/write. RLS is enabled with no anon/authenticated grants.
-- =============================================================================

create extension if not exists pg_trgm;

create or replace function kb_regconfig(p_locale text)
returns regconfig
language sql
immutable
as $$
  select case p_locale
    when 'ru' then 'russian'::regconfig
    when 'es' then 'spanish'::regconfig
    when 'de' then 'german'::regconfig
    else 'english'::regconfig
  end;
$$;

-- ---------------------------------------------------------------------------
-- Taxonomy (language-independent)
-- ---------------------------------------------------------------------------
create table if not exists topics (
  topic_id              text primary key,
  sensitivity           text,
  default_staleness_risk text,
  clean_message_count   int          -- from the topic's summary card
);

create table if not exists subtopics (
  subtopic_id text primary key,
  topic_id    text references topics(topic_id)
);

create table if not exists keywords (
  keyword_id text primary key
);

-- ---------------------------------------------------------------------------
-- Cards (v5)
-- ---------------------------------------------------------------------------
create table if not exists cards (
  card_id                 text primary key,
  topic_id                text not null references topics(topic_id),
  card_type               text not null,          -- 'summary' | 'how_to'
  status                  text not null,          -- active | needs_review | needs_expert_review
  visibility              text not null,          -- 'public' | 'internal'
  confidence              text,
  staleness_risk          text,
  needs_review            boolean default false,
  sensitivity_tags        text[] default '{}',
  sensitivity_level       text,
  quality_score           numeric,
  confidence_score        numeric,
  alignment_score         numeric,        -- semantic_alignment.alignment_score (v5.7); evidence support 0..1
  last_confirmed_date     timestamptz,
  stale_after_days        int,
  requires_periodic_check boolean,
  search_boost            numeric default 0,
  first_seen_message_date timestamptz,
  last_updated_from_message_date timestamptz,
  source_stats            jsonb,
  version                 text          -- dataset card schema version, semver string (v5.10+); was int pre-v5.10
);

create index if not exists idx_cards_topic      on cards(topic_id);
create index if not exists idx_cards_visibility  on cards(visibility, status);

create table if not exists card_subtopics (
  card_id     text references cards(card_id) on delete cascade,
  subtopic_id text references subtopics(subtopic_id) on delete cascade,
  primary key (card_id, subtopic_id)
);

create table if not exists card_keywords (
  card_id    text references cards(card_id) on delete cascade,
  keyword_id text references keywords(keyword_id) on delete cascade,
  primary key (card_id, keyword_id)
);

-- ---------------------------------------------------------------------------
-- Localization
-- ---------------------------------------------------------------------------
create table if not exists topic_translations (
  topic_id    text references topics(topic_id) on delete cascade,
  locale      text not null,
  title       text,
  description text,
  primary key (topic_id, locale)
);

create table if not exists subtopic_translations (
  subtopic_id text references subtopics(subtopic_id) on delete cascade,
  locale      text not null,
  title       text,
  primary key (subtopic_id, locale)
);

create table if not exists keyword_translations (
  keyword_id text references keywords(keyword_id) on delete cascade,
  locale     text not null,
  term       text,
  primary key (keyword_id, locale)
);

create table if not exists card_translations (
  card_id       text references cards(card_id) on delete cascade,
  locale        text not null,
  title         text,
  short_body    text,
  body          text,
  search_text   text,            -- curated multilingual search blob (locale `search`)
  keywords_text text,            -- localized keyword terms + aliases
  search_vector tsvector,
  primary key (card_id, locale)
);

-- Weighted, locale-aware search vector. Curated fields (title, keywords, search
-- text) outrank raw body so synonym/keyword hits surface first.
create or replace function card_translations_tsv()
returns trigger
language plpgsql
as $$
declare
  cfg regconfig := kb_regconfig(new.locale);
begin
  new.search_vector :=
      setweight(to_tsvector(cfg, coalesce(new.title, '')),         'A')
    || setweight(to_tsvector(cfg, coalesce(new.keywords_text, '')), 'B')
    || setweight(to_tsvector(cfg, coalesce(new.search_text, '')),   'B')
    || setweight(to_tsvector(cfg, coalesce(new.short_body, '')),    'C')
    || setweight(to_tsvector(cfg, coalesce(new.body, '')),          'D');
  return new;
end;
$$;

drop trigger if exists trg_card_translations_tsv on card_translations;
create trigger trg_card_translations_tsv
  before insert or update on card_translations
  for each row execute function card_translations_tsv();

create index if not exists idx_card_tr_locale     on card_translations(locale);
create index if not exists idx_card_tr_search     on card_translations using gin (search_vector);
create index if not exists idx_card_tr_title_trgm on card_translations using gin (coalesce(title, '') gin_trgm_ops);
create index if not exists idx_card_tr_short_trgm on card_translations using gin (coalesce(short_body, '') gin_trgm_ops);

create index if not exists idx_topic_tr_locale    on topic_translations(locale);
create index if not exists idx_subtopic_tr_locale on subtopic_translations(locale);
create index if not exists idx_keyword_tr_locale  on keyword_translations(locale);

-- ---------------------------------------------------------------------------
-- Synonym / cross-lingual query expansion (from glossary + entity aliases)
--   alias (lowercased) → expansion (space-joined surface forms of the group)
-- ---------------------------------------------------------------------------
create table if not exists search_aliases (
  alias     text not null,
  expansion text not null,
  locale    text,             -- null = applies to all locales
  source    text,             -- 'glossary' | 'entity' | 'keyword'
  primary key (alias, expansion)
);
create index if not exists idx_search_aliases_alias on search_aliases(alias);

-- ---------------------------------------------------------------------------
-- Related context: glossary terms + entities linked to cards (card-detail panel).
-- Resources are intentionally not ingested yet (v5.7: all internal, no verified
-- URLs, duplicate the entity records). Defined here (before the functions in
-- 0002, which reference them) so get_card can join them.
-- ---------------------------------------------------------------------------
create table if not exists glossary_terms (
  term_id text primary key,
  origin  text,                 -- 'curated' | 'auto_keyword'
  status  text
);
create table if not exists glossary_translations (
  term_id    text references glossary_terms(term_id) on delete cascade,
  locale     text not null,
  term       text,
  definition text,
  primary key (term_id, locale)
);
create table if not exists entities (
  entity_id  text primary key,
  type       text,
  visibility text,
  name       text                -- language-independent fallback (entity_index.name)
);
create table if not exists entity_translations (
  entity_id   text references entities(entity_id) on delete cascade,
  locale      text not null,
  name        text,
  description text,
  primary key (entity_id, locale)
);
create table if not exists card_glossary_terms (
  card_id text references cards(card_id) on delete cascade,
  term_id text references glossary_terms(term_id) on delete cascade,
  primary key (card_id, term_id)
);
create table if not exists card_entities (
  card_id   text references cards(card_id) on delete cascade,
  entity_id text references entities(entity_id) on delete cascade,
  primary key (card_id, entity_id)
);

-- ---------------------------------------------------------------------------
-- Row-Level Security: knowledge base is reachable only via the API role.
-- RLS on, no anon/authenticated grants. service_role bypasses RLS for the
-- Edge Function (reads) and the deploy script (writes).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'topics','subtopics','keywords','cards','card_subtopics','card_keywords',
    'topic_translations','subtopic_translations','keyword_translations','card_translations',
    'search_aliases',
    'glossary_terms','glossary_translations','entities','entity_translations',
    'card_glossary_terms','card_entities'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('grant select on %I to service_role;', t);
  end loop;
end;
$$;
