-- ============================================================================
-- 0084  Workforce: grant DELETE on api.workforce_shift_types (follow-up to
--       0083, which only granted DELETE on the base table).
-- ----------------------------------------------------------------------------
-- 0083 granted DELETE on `workforce.shift_types` but missed the matching
-- grant on the `api.workforce_shift_types` view PostgREST actually queries
-- through -- confirmed live (a real Delete click against the deployed 0083
-- returned `{"status":"unauthorized"}`, i.e. permission denied, even though
-- the base-table grant was present). 0031 already established that this
-- view needs its own explicit privilege grant separate from the base table
-- (`grant insert, update on api.workforce_shift_types to authenticated`,
-- alongside 0025's base-table grant) -- this migration is the missing DELETE
-- counterpart to that same pattern, purely additive, no RLS/policy change.
-- ============================================================================

grant delete on api.workforce_shift_types to authenticated;
