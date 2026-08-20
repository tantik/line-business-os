-- ============================================================================
-- 0076  Grant service_role the underlying base-table privileges its api.*
--       views (granted in 0075) need to actually resolve for a
--       security_invoker caller (WP-10 QA fixture tooling follow-up)
-- ----------------------------------------------------------------------------
-- 0075 granted service_role USAGE on schema `api` + SELECT/INSERT on the five
-- api.* views the fixture script calls. That alone was not enough: every one
-- of those views is `security_invoker = true` (0015/0023/0037/0044's own
-- established pattern), so the underlying base-table privileges must ALSO be
-- granted to whichever role is actually calling -- exactly the same
-- "dependency grant" 0023/0026/0028/0037/0044/0054 already gave
-- `authenticated` for these same tables. Confirmed live: after 0075 alone,
-- service_role still got "permission denied for table employees".
--
-- SCOPE: deliberately narrower than authenticated's own grants where this
-- fixture tool has no UPDATE need (e.g. authenticated holds UPDATE on
-- workforce.shifts/shift_requests/shift_exchanges/inventory.items for its own
-- edit flows; service_role here only ever INSERTs new fixture rows or SELECTs
-- existing state, so UPDATE is intentionally omitted -- least privilege, not
-- just parity with authenticated).
-- ============================================================================

grant usage on schema workforce to service_role;
grant usage on schema inventory to service_role;

grant select on workforce.employees to service_role;
grant select, insert on workforce.shifts to service_role;
grant select, insert on workforce.shift_requests to service_role;
grant select, insert on workforce.shift_exchanges to service_role;
grant select, insert on inventory.items to service_role;
