-- ============================================================================
-- DB test: (tenant_id, user_id) uniqueness for workforce.employees
--          (migration 0063_workforce_employee_user_tenant_uniqueness.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves (per STAFF_AUTH_IDENTITY_ARCHITECTURE_AUDIT founder decision 2):
--   * Tenant A, user X -> employee A1: allowed.
--   * Tenant A, SAME user X -> employee A2: rejected (same tenant, same user).
--   * Tenant B, SAME user X -> employee B1: allowed (different tenant).
--   * NULL user_id: multiple uninvited employees per tenant: allowed.
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce;
select no_plan();

select has_index('workforce', 'employees', 'wf_employees_one_per_tenant_per_user',
  'wf_employees_one_per_tenant_per_user index exists on workforce.employees');

insert into core.tenants (id, slug, name) values
  ('db000000-0000-0000-0000-000000000001', 'pgtap-uniqueness-tenant-a', 'pgTAP Uniqueness Tenant A'),
  ('db000000-0000-0000-0000-000000000002', 'pgtap-uniqueness-tenant-b', 'pgTAP Uniqueness Tenant B');

insert into core.locations (id, tenant_id, name) values
  ('db100000-0000-0000-0000-000000000001', 'db000000-0000-0000-0000-000000000001', 'Tenant A Location'),
  ('db100000-0000-0000-0000-000000000002', 'db000000-0000-0000-0000-000000000002', 'Tenant B Location');

insert into core.users (id, display_name) values
  ('db200000-0000-0000-0000-000000000001', 'User X (multi-tenant)');

-- --- Tenant A, user X -> employee A1: allowed --------------------------------
select lives_ok(
  $q$ insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted)
        values ('db300000-0000-0000-0000-000000000001', 'db000000-0000-0000-0000-000000000001',
                'db100000-0000-0000-0000-000000000001', 'db200000-0000-0000-0000-000000000001', '\x00') $q$,
  'Tenant A: user X bound to employee A1 -- allowed'
);

-- --- Tenant A, SAME user X -> employee A2: rejected --------------------------
select throws_ok(
  $q$ insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted)
        values ('db300000-0000-0000-0000-000000000002', 'db000000-0000-0000-0000-000000000001',
                'db100000-0000-0000-0000-000000000001', 'db200000-0000-0000-0000-000000000001', '\x00') $q$,
  '23505',
  null,
  'Tenant A: SAME user X cannot be bound to a second employee A2 (unique violation)'
);

-- --- Tenant B, SAME user X -> employee B1: allowed (different tenant) --------
select lives_ok(
  $q$ insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted)
        values ('db300000-0000-0000-0000-000000000003', 'db000000-0000-0000-0000-000000000002',
                'db100000-0000-0000-0000-000000000002', 'db200000-0000-0000-0000-000000000001', '\x00') $q$,
  'Tenant B: SAME user X bound to employee B1 -- allowed (multi-tenant employment)'
);

-- --- NULL user_id: multiple uninvited employees per tenant: allowed ----------
select lives_ok(
  $q$ insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted)
        values ('db300000-0000-0000-0000-000000000004', 'db000000-0000-0000-0000-000000000001',
                'db100000-0000-0000-0000-000000000001', null, '\x00') $q$,
  'Tenant A: first not-yet-invited (user_id null) employee -- allowed'
);
select lives_ok(
  $q$ insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted)
        values ('db300000-0000-0000-0000-000000000005', 'db000000-0000-0000-0000-000000000001',
                'db100000-0000-0000-0000-000000000001', null, '\x00') $q$,
  'Tenant A: second not-yet-invited (user_id null) employee -- also allowed (nulls not indexed)'
);

select is(
  (select count(*)::int from workforce.employees where tenant_id = 'db000000-0000-0000-0000-000000000001'),
  3,
  'Tenant A ends with exactly 3 employees (A1 + 2 uninvited; the rejected A2 insert never landed)'
);

select * from finish();
rollback;
