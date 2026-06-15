-- =============================================================================
-- User profiles + per-user default locale.
--
-- Authentication is handled by Supabase Auth (email + password). Each auth user
-- gets one profile row holding their preferred default locale. The profile is
-- reachable ONLY through the Edge Function API (service_role); the browser never
-- queries it directly — consistent with the lock-down in migration 0004.
-- =============================================================================

create table if not exists profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  default_locale text not null default 'ru' check (default_locale in ('ru', 'en', 'es', 'de')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- RLS on, no anon/authenticated grants or policies: direct access is denied for
-- everyone. The API role (service_role) bypasses RLS.
alter table profiles enable row level security;
grant select, insert, update on profiles to service_role;

-- Keep updated_at fresh.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated on profiles;
create trigger trg_profiles_updated
  before update on profiles
  for each row execute function set_updated_at();

-- Auto-create a profile when a new auth user signs up.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
