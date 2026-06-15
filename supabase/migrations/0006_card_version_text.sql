-- =============================================================================
-- v5.10: card `version` changed from an integer to a semver string ("5.8.0",
-- "5.9.0"). Widen the column so the importer can store it verbatim. `version` is
-- stored metadata only (not referenced by any RPC), so this is a safe widening.
-- Idempotent: text -> text is a harmless no-op on re-run.
-- =============================================================================
alter table cards alter column version type text using version::text;
