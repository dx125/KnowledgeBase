-- =============================================================================
-- Normalized Q&A layer (v7.3): questions reference answer-cards.
--
-- An ANSWER lives exactly once — as a card (the topic.faq_* cards). A QUESTION is
-- stored separately and points at the card that answers it (answer_card_id), so
-- there is no duplicated answer text. Each question carries `ask_frequency`, a
-- best-effort count of how often it is asked in the source chat, used to surface
-- the globally most-asked questions (not just per-topic). See
-- dataset-patches/questions.json + scripts/build-questions.mjs.
--
-- RLS: reachable only via the API role (service_role), like every other table.
-- =============================================================================

create table if not exists questions (
  question_id    text primary key,
  answer_card_id text not null references cards(card_id) on delete cascade,
  topic_id       text references topics(topic_id) on delete set null,
  ask_frequency  int  not null default 0,   -- relative demand signal (source-chat count)
  status         text not null default 'active',
  visibility     text not null default 'public'
);
create index if not exists idx_questions_topic on questions(topic_id);
create index if not exists idx_questions_freq  on questions(ask_frequency desc);

create table if not exists question_translations (
  question_id text references questions(question_id) on delete cascade,
  locale      text not null,
  phrasings   text[] not null default '{}',  -- localized phrasings; [1] = primary
  primary key (question_id, locale)
);
create index if not exists idx_question_tr_locale on question_translations(locale);

do $$
begin
  execute 'alter table questions enable row level security';
  execute 'alter table question_translations enable row level security';
  execute 'grant select on questions to service_role';
  execute 'grant select on question_translations to service_role';
end;
$$;

-- ---------------------------------------------------------------------------
-- list_questions — questions ranked by ask_frequency (global "most asked"),
-- optionally filtered to one topic. Resolves the localized primary phrasing and
-- the answer card's text (so the client can render question -> answer in one call).
-- Only questions whose answer card is public+active are returned, unless
-- p_include_internal. Per-row EN fallback if a locale phrasing/card text is missing.
-- ---------------------------------------------------------------------------
create or replace function list_questions(
  p_locale text default 'ru',
  p_topic_id text default null,
  p_limit int default 100,
  p_include_internal boolean default false
)
returns table (
  question_id     text,
  topic_id        text,
  ask_frequency   int,
  question        text,
  answer_card_id  text,
  answer_title    text,
  answer_short    text,
  answer_body     text,
  topic_title     text
)
language sql
stable
as $$
  with loc as (select kb_effective_locale(p_locale) as locale)
  select
    q.question_id,
    q.topic_id,
    q.ask_frequency,
    coalesce(qt.phrasings[1], qte.phrasings[1], ct.title, cte.title)        as question,
    q.answer_card_id,
    coalesce(ct.title, cte.title)             as answer_title,
    coalesce(ct.short_body, cte.short_body)   as answer_short,
    coalesce(ct.body, cte.body)               as answer_body,
    coalesce(tt.title, tte.title)             as topic_title
  from questions q
  join cards c on c.card_id = q.answer_card_id
  left join question_translations qt  on qt.question_id = q.question_id and qt.locale = (select locale from loc)
  left join question_translations qte on qte.question_id = q.question_id and qte.locale = 'en'
  left join card_translations ct  on ct.card_id = q.answer_card_id and ct.locale = (select locale from loc)
  left join card_translations cte on cte.card_id = q.answer_card_id and cte.locale = 'en'
  left join topic_translations tt  on tt.topic_id = q.topic_id and tt.locale = (select locale from loc)
  left join topic_translations tte on tte.topic_id = q.topic_id and tte.locale = 'en'
  where (p_include_internal or (q.visibility = 'public' and q.status = 'active'
                                and c.visibility = 'public' and c.status = 'active'))
    and (p_topic_id is null or q.topic_id = p_topic_id)
  order by q.ask_frequency desc, q.question_id
  limit greatest(coalesce(p_limit, 100), 1);
$$;

grant execute on function list_questions(text, text, int, boolean) to service_role;
