-- ============================================================================
-- 0077  Grant service_role EXECUTE on the two SECURITY DEFINER permission
--       helpers its granted api.* views/tables need (WP-10 QA fixture
--       tooling follow-up, second round)
-- ----------------------------------------------------------------------------
-- 0075/0076 granted service_role schema/table access; that alone was still
-- not enough for `api.workforce_staff_directory` specifically -- its own
-- view definition (0023_workforce_api_facade.sql) calls
-- `core.has_permission(...)` directly in its WHERE clause (not merely via an
-- RLS policy `service_role`'s BYPASSRLS attribute would skip), and calling a
-- SECURITY DEFINER function still requires an explicit EXECUTE grant
-- regardless of the caller's other privileges. Confirmed live: after 0075/
-- 0076, service_role still got "permission denied for function
-- has_permission".
--
-- `workforce.is_own_employee(uuid)` is granted alongside it even though not
-- yet confirmed to be a live blocker (workforce.shift_requests/
-- shift_exchanges' own RLS policies call it, but only inside a USING/WITH
-- CHECK clause `service_role`'s BYPASSRLS should skip entirely) -- granting
-- it now avoids a third narrow follow-up migration for the same fixture
-- tool if that assumption turns out wrong, and it is exactly as
-- narrowly-scoped as the has_permission grant below.
-- ============================================================================

grant execute on function core.has_permission(uuid, text, uuid) to service_role;
grant execute on function workforce.is_own_employee(uuid) to service_role;
