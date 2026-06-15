-- =============================================================================
-- Data version log — records every dataset deploy.
--
-- The deploy script (scripts/deploy.mjs) runs a full atomic replace of the
-- knowledge-base content inside a single transaction and appends one row here.
-- This gives an audit trail (what was deployed, when, how many rows, content
-- hash) without versioning every content row.
-- =============================================================================

create table if not exists kb_data_versions (
  id                bigint generated always as identity primary key,
  version_label     text,                    -- optional human label, e.g. "2026-06-20 rent polish"
  source_hash       text,                    -- sha256 of the source files at deploy time
  topic_count       int,
  card_count        int,
  translation_count int,
  notes             text,
  deployed_at       timestamptz not null default now()
);

create index if not exists idx_kb_data_versions_deployed on kb_data_versions(deployed_at desc);

-- Public read (so the app can show "data as of …").
alter table kb_data_versions enable row level security;
drop policy if exists "public read kb_data_versions" on kb_data_versions;
create policy "public read kb_data_versions" on kb_data_versions
  for select to anon, authenticated using (true);
grant select on kb_data_versions to anon, authenticated;

-- Convenience RPC: the currently deployed (latest) data version.
create or replace function current_data_version()
returns kb_data_versions
language sql
stable
as $$
  select * from kb_data_versions order by deployed_at desc, id desc limit 1;
$$;

grant execute on function current_data_version() to anon, authenticated;
