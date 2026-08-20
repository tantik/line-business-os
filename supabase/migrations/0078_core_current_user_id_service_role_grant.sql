-- ============================================================================
-- 0078  Grant service_role USAGE on schema core + EXECUTE on
--       core.current_user_id() (WP-10 QA fixture tooling follow-up, third
--       round)
-- ----------------------------------------------------------------------------
-- `inventory.items`' own BEFORE INSERT trigger (`stamp_item_actor`,
-- 0035_inventory_stock_check.sql) is a plain (invoker) trigger function that
-- calls `core.current_user_id()` to stamp `created_by`/`updated_by`. Calling
-- ANY object in a schema first requires USAGE on that schema (a separate,
-- more basic privilege than EXECUTE on the specific function) -- service_role
-- had neither for schema `core`. Confirmed live: after 0075-0077,
-- service_role's insert into `api.inventory_items` still failed with
-- "permission denied for schema core".
--
-- `core.current_user_id()` returns NULL for a service-role caller (no JWT
-- `sub` claim) -- `inventory.items.created_by`/`updated_by` are nullable
-- (`uuid references core.users(id)`, no NOT NULL), so this is a harmless
-- NULL stamp for fixture-tool-created rows, not a broken audit trail for
-- real user-created ones.
-- ============================================================================

grant usage on schema core to service_role;
grant execute on function core.current_user_id() to service_role;
