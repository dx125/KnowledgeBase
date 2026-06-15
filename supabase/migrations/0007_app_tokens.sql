-- =============================================================================
-- Per-application API tokens (machine-to-machine auth).
--
-- Lets an external app (e.g. a mobile client) authenticate with one long-lived,
-- per-app token instead of implementing Supabase user login. The Edge Function
-- accepts the token (in `Authorization: Bearer <token>` or `X-API-Key`), hashes
-- it, and looks it up here. Only the SHA-256 hash is stored — the raw token is
-- shown once at issuance (scripts/issue-token.mjs) and never persisted.
--
-- Like every other table, api_clients is reachable ONLY via the service_role
-- (Edge Function); RLS is on with no anon/authenticated grants (see 0004).
-- =============================================================================

create table if not exists api_clients (
  client_id      uuid primary key default gen_random_uuid(),
  name           text not null,                       -- human label, e.g. "uy-mobile-ios"
  token_prefix   text not null,                       -- first chars of the token, for display/identification
  token_hash     text not null unique,                -- sha256(token) hex; raw token never stored
  default_locale text not null default 'ru' check (default_locale in ('ru', 'en', 'es', 'de')),
  allow_internal boolean not null default false,      -- may this app request internal/unreviewed cards?
  active         boolean not null default true,       -- flip to false to revoke without deleting
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz,
  expires_at     timestamptz                          -- null = permanent
);
create index if not exists idx_api_clients_token_hash on api_clients(token_hash);

-- Validate a presented token (already hashed by the caller) and return the
-- client if it is usable right now. STABLE so it can be called per request.
create or replace function kb_authenticate_client(p_token_hash text)
returns table (client_id uuid, name text, default_locale text, allow_internal boolean)
language sql
stable
as $$
  select client_id, name, default_locale, allow_internal
  from api_clients
  where token_hash = p_token_hash
    and active
    and (expires_at is null or expires_at > now());
$$;

-- Best-effort "last seen" touch (the Edge Function calls this after auth).
create or replace function kb_touch_client(p_client_id uuid)
returns void
language sql
as $$
  update api_clients set last_used_at = now() where client_id = p_client_id;
$$;

alter table api_clients enable row level security;
grant select, insert, update on api_clients to service_role;
grant execute on function kb_authenticate_client(text) to service_role;
grant execute on function kb_touch_client(uuid)        to service_role;
