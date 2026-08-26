-- ============================================================================
-- DB test: api-facade for Staff invitations (migration
--          0065_workforce_employee_invitations_facade.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves:
--   * api.workforce_employee_invitations exists, is security_invoker, and
--     exposes no target_user_id/invited_by (no raw user id).
--   * SELECT through the view matches the same RLS-driven visibility 0032
--     already proved directly against the base table (manager sees all in
--     tenant, invited person sees only their own, third party/other-tenant
--     manager see nothing).
--   * UPDATE through the view (Manager revoke) works with zero new grant.
--   * api.upsert_employee_invitation: a Manager can create a new invitation
--     for an unbound employee; calling it again for the same employee
--     refreshes the existing pending row in place (resend, same id, no
--     second row) rather than violating the one-pending-per-employee index;
--     a non-Manager caller is rejected; an already-bound employee is
--     rejected; a bogus employee id is rejected.
--   * api schema still contains no SECURITY DEFINER function.
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce, api;
select no_plan();

select has_view('api', 'workforce_employee_invitations', 'api.workforce_employee_invitations view exists');

select ok(
  exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral unnest(c.reloptions) o(opt)
    where n.nspname = 'api' and c.relname = 'workforce_employee_invitations'
      and lower(o.opt) = 'security_invoker=true'
  ),
  'api.workforce_employee_invitations is security_invoker'
);

select is(
  (select count(*)::int
     from information_schema.columns
    where table_schema = 'api' and table_name = 'workforce_employee_invitations'
      and column_name in ('target_user_id', 'invited_by')),
  0,
  'api.workforce_employee_invitations exposes no raw user id (target_user_id/invited_by)'
);

select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'api'
      and p.prosecdef),
  0,
  'api schema still contains no SECURITY DEFINER function after 0065'
);

create function pg_temp.as_auth_exec(p_sub text, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return true;
exception when others then
  reset role;
  return false;
end;
$$;

create function pg_temp.as_auth_count(p_sub text, p_sql text)
returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql into n;
  reset role;
  return n;
end;
$$;

-- Runs an invite/resend call as the given user and returns the resulting
-- invitation id as text (the only value these tests need to assert on).
create function pg_temp.as_auth_upsert_invitation(
  p_sub text, p_tenant_id uuid, p_employee_id uuid, p_target_user_id uuid, p_invitation_id uuid
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  select out_invitation_id into v_id
    from api.upsert_employee_invitation(p_tenant_id, p_employee_id, p_target_user_id, p_invitation_id);
  reset role;
  return v_id;
end;
$$;

-- ============================================================================
-- Fixtures
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('cf000000-0000-0000-0000-000000000001', 'pgtap-invitations-facade-a', 'pgTAP Invitations Facade A'),
  ('cf000000-0000-0000-0000-000000000002', 'pgtap-invitations-facade-b', 'pgTAP Invitations Facade B');
-- Workforce is fail-closed by default since 0097_workforce_module_access_gate.sql;
-- this file's scenarios assume normal, Workforce-ON behavior for both fixture tenants.
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('cf000000-0000-0000-0000-000000000001', 'workforce', true),
  ('cf000000-0000-0000-0000-000000000002', 'workforce', true);
insert into core.locations (id, tenant_id, name) values
  ('cf100000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000001', 'Tenant A Location');
insert into core.users (id, display_name) values
  ('cf200000-0000-0000-0000-000000000001', 'Manager A'),
  ('cf200000-0000-0000-0000-000000000002', 'Invited Person'),
  ('cf200000-0000-0000-0000-000000000003', 'Non-Manager Staff'),
  ('cf200000-0000-0000-0000-000000000004', 'Third Party');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('cf000000-0000-0000-0000-000000000001', 'cf200000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000005', 'cf100000-0000-0000-0000-000000000001'),
  ('cf000000-0000-0000-0000-000000000001', 'cf200000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000006', 'cf100000-0000-0000-0000-000000000001');

insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('cf300000-0000-0000-0000-000000000001', 'cf000000-0000-0000-0000-000000000001',
   'cf100000-0000-0000-0000-000000000001', null, '\x00'), -- unbound, invitable
  ('cf300000-0000-0000-0000-000000000002', 'cf000000-0000-0000-0000-000000000001',
   'cf100000-0000-0000-0000-000000000001', 'cf200000-0000-0000-0000-000000000003', '\x00'); -- already bound

-- ============================================================================
-- Section 1: api.upsert_employee_invitation
-- ============================================================================

select ok(
  not pg_temp.as_auth_exec('cf200000-0000-0000-0000-000000000003', -- non-manager
    $q$ select api.upsert_employee_invitation('cf000000-0000-0000-0000-000000000001',
          'cf300000-0000-0000-0000-000000000001', 'cf200000-0000-0000-0000-000000000002',
          'cf400000-0000-0000-0000-000000000001') $q$),
  'a non-Manager caller cannot create an invitation'
);

select ok(
  not pg_temp.as_auth_exec('cf200000-0000-0000-0000-000000000001', -- manager
    $q$ select api.upsert_employee_invitation('cf000000-0000-0000-0000-000000000001',
          'cf300000-0000-0000-0000-000000000002', 'cf200000-0000-0000-0000-000000000004',
          'cf400000-0000-0000-0000-000000000002') $q$),
  'Manager cannot invite an employee already bound to a user_id'
);

select ok(
  not pg_temp.as_auth_exec('cf200000-0000-0000-0000-000000000001',
    $q$ select api.upsert_employee_invitation('cf000000-0000-0000-0000-000000000001',
          '00000000-0000-0000-0000-000000000000', 'cf200000-0000-0000-0000-000000000002',
          'cf400000-0000-0000-0000-000000000003') $q$),
  'Manager cannot invite a bogus employee id'
);

select is(
  pg_temp.as_auth_upsert_invitation('cf200000-0000-0000-0000-000000000001',
    'cf000000-0000-0000-0000-000000000001', 'cf300000-0000-0000-0000-000000000001',
    'cf200000-0000-0000-0000-000000000002', 'cf400000-0000-0000-0000-000000000001'),
  'cf400000-0000-0000-0000-000000000001'::uuid,
  'first invite returns the given invitation id'
);

select is(
  (select count(*)::int from workforce.employee_invitations
    where id = 'cf400000-0000-0000-0000-000000000001' and status = 'pending'),
  1,
  'first invite created exactly one pending row with the given id'
);

-- second call for the SAME employee: resend, refreshes in place, no 2nd row.
select is(
  pg_temp.as_auth_upsert_invitation('cf200000-0000-0000-0000-000000000001',
    'cf000000-0000-0000-0000-000000000001', 'cf300000-0000-0000-0000-000000000001',
    'cf200000-0000-0000-0000-000000000002', 'cf400000-0000-0000-0000-000000000099'),
  'cf400000-0000-0000-0000-000000000001'::uuid,
  'resend returns the ORIGINAL invitation id, not the second id passed in -- one continuous audit row'
);

select is(
  (select count(*)::int from workforce.employee_invitations
    where tenant_id = 'cf000000-0000-0000-0000-000000000001'
      and employee_id = 'cf300000-0000-0000-0000-000000000001'),
  1,
  'resend refreshed the existing row in place -- still exactly one row for this employee'
);
select is(
  (select id from workforce.employee_invitations
    where tenant_id = 'cf000000-0000-0000-0000-000000000001'
      and employee_id = 'cf300000-0000-0000-0000-000000000001'),
  'cf400000-0000-0000-0000-000000000001'::uuid,
  'resend kept the ORIGINAL invitation id (not the second id passed in) -- one continuous audit row'
);

-- ============================================================================
-- Section 2: SELECT through the view matches 0032's RLS behavior
-- ============================================================================

select is(
  pg_temp.as_auth_count('cf200000-0000-0000-0000-000000000001', -- manager
    $q$ select count(*)::int from api.workforce_employee_invitations
          where tenant_id = 'cf000000-0000-0000-0000-000000000001' $q$),
  1,
  'manager sees the invitation through the view'
);
select is(
  pg_temp.as_auth_count('cf200000-0000-0000-0000-000000000002', -- invited person
    $q$ select count(*)::int from api.workforce_employee_invitations
          where invitation_id = 'cf400000-0000-0000-0000-000000000001' $q$),
  1,
  'the invited person sees their own invitation through the view'
);
select is(
  pg_temp.as_auth_count('cf200000-0000-0000-0000-000000000004', -- third party
    $q$ select count(*)::int from api.workforce_employee_invitations
          where tenant_id = 'cf000000-0000-0000-0000-000000000001' $q$),
  0,
  'an unrelated third party sees nothing through the view'
);

-- ============================================================================
-- Section 3: UPDATE through the view (Manager revoke)
-- ============================================================================

select ok(
  pg_temp.as_auth_exec('cf200000-0000-0000-0000-000000000001',
    $q$ update api.workforce_employee_invitations
          set status = 'revoked', revoked_at = now()
          where invitation_id = 'cf400000-0000-0000-0000-000000000001' $q$),
  'manager CAN revoke a pending invitation through the view'
);
select is(
  (select status from workforce.employee_invitations where id = 'cf400000-0000-0000-0000-000000000001'),
  'revoked',
  'the revoke through the view actually updated the base table'
);
-- A fresh PENDING row (as superuser, standing in for the Edge Function's
-- service_role insert): RLS on UPDATE silently filters non-matching rows
-- rather than raising, so a rowcount check is required here -- an
-- unauthorized attempt against a genuinely pending row must affect 0 rows,
-- not merely "not throw".
insert into workforce.employee_invitations
  (id, tenant_id, employee_id, target_user_id, invited_by) values
  ('cf400000-0000-0000-0000-000000000004', 'cf000000-0000-0000-0000-000000000001',
   'cf300000-0000-0000-0000-000000000001', 'cf200000-0000-0000-0000-000000000002',
   'cf200000-0000-0000-0000-000000000001');

create function pg_temp.as_auth_rowcount(p_sub text, p_sql text)
returns int language plpgsql as $$
declare n int;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql;
  get diagnostics n = row_count;
  reset role;
  return n;
end;
$$;

select is(
  pg_temp.as_auth_rowcount('cf200000-0000-0000-0000-000000000002', -- invited person, not a manager
    $q$ update api.workforce_employee_invitations
          set status = 'revoked', revoked_at = now()
          where invitation_id = 'cf400000-0000-0000-0000-000000000004' $q$),
  0,
  'a non-manager (even the invited person themselves) cannot revoke through the view (0 rows affected)'
);
select is(
  (select status from workforce.employee_invitations where id = 'cf400000-0000-0000-0000-000000000004'),
  'pending',
  'the pending invitation was NOT modified by the rejected non-manager revoke attempt'
);

select * from finish();
rollback;
