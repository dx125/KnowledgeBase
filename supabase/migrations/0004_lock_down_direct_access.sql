-- =============================================================================
-- Lock down direct database access.
--
-- The public HTTP API (Edge Function `kb`) becomes the ONLY way to reach the
-- data. The browser's public key can no longer query tables or RPCs directly
-- through PostgREST:
--   * RLS read policies for anon/authenticated are dropped.
--   * Table privileges for anon/authenticated are revoked.
--   * EXECUTE on the data functions is revoked from PUBLIC/anon/authenticated
--     (Postgres grants function EXECUTE to PUBLIC by default — must revoke).
--
-- The Edge Function connects with the service_role key, which bypasses RLS and
-- is granted the privileges it needs below.
-- =============================================================================

-- --- Tables: drop public-read policies, revoke anon/authenticated, keep RLS ---
do $$
declare t text;
begin
  foreach t in array array[
    'topics','subtopics','keywords','cards','card_subtopics','card_keywords',
    'topic_translations','subtopic_translations','keyword_translations','card_translations',
    'search_aliases','kb_data_versions'
  ] loop
    execute format('drop policy if exists "public read %1$s" on %1$I;', t);
    execute format('revoke all on %I from anon, authenticated;', t);
    execute format('grant select on %I to service_role;', t);   -- API role reads
  end loop;
end $$;

-- --- Functions: revoke from PUBLIC/anon/authenticated, grant to service_role --
do $$
declare f text;
begin
  foreach f in array array[
    'kb_regconfig(text)',
    'kb_effective_locale(text)',
    'kb_expand_query(text, text)',
    'list_topics(text, boolean)',
    'get_topic_cards(text, text, boolean)',
    'search_cards(text, text, text, int, int, boolean)',
    'get_card(text, text)',
    'current_data_version()'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated;', f);
    execute format('grant execute on function %s to service_role;', f);
  end loop;
end $$;
