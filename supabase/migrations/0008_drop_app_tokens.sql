-- =============================================================================
-- Retire the per-app static-token scheme from 0007.
--
-- The mobile/server integration moved to standard Supabase auth (anon key +
-- user JWT): each integrating app authenticates as a dedicated Supabase
-- "service account" user from its own backend, so a custom token table is no
-- longer needed. The Edge Function no longer references these objects.
-- Idempotent; safe on databases that never had 0007 applied.
-- =============================================================================
drop function if exists kb_authenticate_client(text);
drop function if exists kb_touch_client(uuid);
drop table if exists api_clients;
