-- ============================================================================
-- 0063  Workforce Cafe v2.1: one Auth user -> at most one employee per tenant
-- ----------------------------------------------------------------------------
-- Founder decision 2 (STAFF_AUTH_IDENTITY_ARCHITECTURE_AUDIT): within ONE
-- tenant, one authenticated human/user maps to at most ONE
-- workforce.employees identity. The SAME human MAY separately be an employee
-- of a DIFFERENT tenant (multi-tenant contractors/owners are a real case in
-- this product), so the invariant is scoped to (tenant_id, user_id), not
-- user_id alone.
--
-- Conflict audit (required by the task brief before adding this constraint):
--   select tenant_id, user_id, count(*)
--     from workforce.employees
--    where user_id is not null
--    group by tenant_id, user_id
--   having count(*) > 1;
-- Run locally against a freshly-reset DB (`pnpm exec supabase db reset`):
-- 0 rows. No conflicting data exists in this repository's migrations or seed
-- data. The same audit query MUST be re-run against Preview's actual data
-- before this migration is applied there (see the
-- STAFF_AUTH_PROVISIONING_LOCAL_IMPLEMENTATION_REPORT for the Preview
-- migration plan) -- this migration does not delete or rewrite any row; if
-- Preview has conflicting data, applying it will fail loudly (constraint
-- violation) rather than silently repairing anything, per the brief.
--
-- A plain partial unique INDEX (not a table CONSTRAINT) is used, matching
-- this schema's existing precedent for conditional uniqueness
-- (wf_shift_requests_one_preference_per_day, 0028;
-- wf_shift_exchanges_one_active_per_shift, 0044) -- Postgres unique indexes
-- with a WHERE clause simply never index NULL user_id rows, so any number of
-- not-yet-invited (user_id IS NULL) employees per tenant remains unaffected,
-- with no need for a NULLS NOT DISTINCT / composite-null workaround.
-- ============================================================================

create unique index if not exists wf_employees_one_per_tenant_per_user
  on workforce.employees (tenant_id, user_id)
  where user_id is not null;

comment on index workforce.wf_employees_one_per_tenant_per_user is
  'Enforces founder decision 2: within one tenant, an Auth user (user_id) may be bound to at most one workforce.employees row. The same user_id MAY appear once each in different tenants (multi-tenant employment is allowed) -- scoped to (tenant_id, user_id), not a bare unique(user_id). NULL user_id (not-yet-invited employees) rows are excluded from the index entirely, so any number of them may coexist per tenant.';
