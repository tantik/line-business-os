-- ============================================================================
-- 0075  Grant service_role read/write on the specific `api.*` views the
--       Cafe Manager UI/UX Parity mission's QA fixture tool needs
--       (packages/db/scripts/oruwa-cafe-fixture-write.ts, WP-10)
-- ----------------------------------------------------------------------------
-- ROOT CAUSE: 0015_api_facade.sql's own doc comment claims "`service_role`
-- needs no grant: it bypasses RLS and the owner (postgres) keeps privileges
-- on what it owns" -- this conflates two SEPARATE Postgres privilege systems.
-- BYPASSRLS (a role attribute service_role already has) only exempts a role
-- from ROW-LEVEL security POLICY checks; it does nothing for ordinary
-- schema/table-level GRANTs (USAGE/SELECT/INSERT). Without an explicit GRANT,
-- `service_role` gets "permission denied for schema api" even though it would
-- bypass RLS once past that check. This was never caught before because no
-- tool had ever called `.schema('api')` as `service_role` until this fixture
-- script -- every other read/write in this codebase goes through
-- `authenticated`/`anon` via a real user session.
--
-- SCOPE: additive only. Does not touch any RLS policy, does not change
-- `anon`/`authenticated` grants, does not widen what any end-user-facing
-- request can do -- `service_role` is already a fully trusted, backend-only
-- credential (see packages/db/src/client.ts's own doc comment: "must ONLY be
-- used in trusted server contexts... Never import this into the web client
-- bundle"). This only lets that already-maximally-trusted role reach the SAME
-- sanctioned `api.*` facade the app itself already uses, instead of granting
-- blanket access to every `api` object -- deliberately scoped to just the five
-- views the fixture tool actually calls, not `GRANT ALL ON ALL TABLES IN
-- SCHEMA api` and no `ALTER DEFAULT PRIVILEGES` (a future new `api` view still
-- needs its own explicit grant here, by design, so this list stays a
-- reviewable inventory of what service_role can actually reach).
-- ============================================================================

grant usage on schema api to service_role;

grant select on api.workforce_staff_directory to service_role;
grant select, insert on api.inventory_items to service_role;
grant select, insert on api.workforce_shift_requests to service_role;
grant select, insert on api.workforce_shift_assignments to service_role;
grant select, insert on api.workforce_shift_exchanges to service_role;
