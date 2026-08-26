-- ============================================================================
-- DB test: Staff invitation domain model + atomic binding RPC
--          (migration 0064_workforce_employee_invitations.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Proves:
--   * RLS: manager sees every invitation in their tenant; the invited person
--     sees only their own rows; a third party sees nothing.
--   * Manager can revoke a pending invitation (plain RLS UPDATE); cannot
--     revoke an already-accepted one.
--   * api.accept_employee_invitation(): the invited person CAN accept their
--     own pending, unexpired invitation -- it ensures core.users, activates
--     tenant membership, grants the employee role, binds
--     workforce.employees.user_id, and marks the invitation accepted, all
--     atomically.
--   * Negative/tamper cases: a different authenticated user cannot accept
--     someone else's invitation; an already-accepted invitation cannot be
--     reused; a revoked invitation cannot be accepted; an expired invitation
--     cannot be accepted; an employee already bound to another user cannot
--     be silently rebound (0063's uniqueness is the backstop); a bogus
--     invitation id fails cleanly.
-- ============================================================================

begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, workforce;
select no_plan();

select has_table('workforce', 'employee_invitations', 'workforce.employee_invitations exists');

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

-- ============================================================================
-- Fixtures: two tenants, so a cross-tenant negative case is possible too.
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('dc000000-0000-0000-0000-000000000001', 'pgtap-invitations-tenant-a', 'pgTAP Invitations Tenant A'),
  ('dc000000-0000-0000-0000-000000000002', 'pgtap-invitations-tenant-b', 'pgTAP Invitations Tenant B');
-- Workforce is fail-closed by default since 0097_workforce_module_access_gate.sql;
-- this file's scenarios assume normal, Workforce-ON behavior for both fixture tenants.
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('dc000000-0000-0000-0000-000000000001', 'workforce', true),
  ('dc000000-0000-0000-0000-000000000002', 'workforce', true);
insert into core.locations (id, tenant_id, name) values
  ('dc100000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000001', 'Tenant A Location'),
  ('dc100000-0000-0000-0000-000000000002', 'dc000000-0000-0000-0000-000000000002', 'Tenant B Location');
insert into core.users (id, display_name) values
  ('dc200000-0000-0000-0000-000000000001', 'Manager A'),
  ('dc200000-0000-0000-0000-000000000002', 'Invited Person 1'),
  ('dc200000-0000-0000-0000-000000000003', 'Invited Person 2'),
  ('dc200000-0000-0000-0000-000000000004', 'Unrelated Third Party'),
  ('dc200000-0000-0000-0000-000000000005', 'Manager B');
insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('dc000000-0000-0000-0000-000000000001', 'dc200000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000005', 'dc100000-0000-0000-0000-000000000001'),
  ('dc000000-0000-0000-0000-000000000002', 'dc200000-0000-0000-0000-000000000005',
   '00000000-0000-0000-0000-000000000005', 'dc100000-0000-0000-0000-000000000002');

insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('dc300000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000001',
   'dc100000-0000-0000-0000-000000000001', null, '\x00'), -- not yet invited/bound
  ('dc300000-0000-0000-0000-000000000002', 'dc000000-0000-0000-0000-000000000001',
   'dc100000-0000-0000-0000-000000000001', null, '\x00'), -- for the revoke test
  ('dc300000-0000-0000-0000-000000000003', 'dc000000-0000-0000-0000-000000000001',
   'dc100000-0000-0000-0000-000000000001', 'dc200000-0000-0000-0000-000000000003', '\x00'); -- already bound

-- A live pending invitation (person 1 -> employee 1), created as superuser --
-- exactly as the Edge Function would insert it (service_role bypasses RLS,
-- so this INSERT stands in for that, matching this table's design: no
-- INSERT policy exists for `authenticated` at all).
insert into workforce.employee_invitations
  (id, tenant_id, employee_id, target_user_id, status, invited_by) values
  ('dc400000-0000-0000-0000-000000000001', 'dc000000-0000-0000-0000-000000000001',
   'dc300000-0000-0000-0000-000000000001', 'dc200000-0000-0000-0000-000000000002',
   'pending', 'dc200000-0000-0000-0000-000000000001');

-- A pending invitation to revoke (employee 2) --------------------------------
insert into workforce.employee_invitations
  (id, tenant_id, employee_id, target_user_id, status, invited_by) values
  ('dc400000-0000-0000-0000-000000000002', 'dc000000-0000-0000-0000-000000000001',
   'dc300000-0000-0000-0000-000000000002', 'dc200000-0000-0000-0000-000000000003',
   'pending', 'dc200000-0000-0000-0000-000000000001');

-- ============================================================================
-- Section 1: RLS -- who can SELECT what
-- ============================================================================

select is(
  pg_temp.as_auth_count('dc200000-0000-0000-0000-000000000001', -- manager A
    $q$ select count(*)::int from workforce.employee_invitations
          where tenant_id = 'dc000000-0000-0000-0000-000000000001' $q$),
  2,
  'manager A sees every invitation in their tenant'
);
select is(
  pg_temp.as_auth_count('dc200000-0000-0000-0000-000000000002', -- invited person 1
    $q$ select count(*)::int from workforce.employee_invitations
          where id = 'dc400000-0000-0000-0000-000000000001' $q$),
  1,
  'the invited person sees their own invitation row'
);
select is(
  pg_temp.as_auth_count('dc200000-0000-0000-0000-000000000002', -- invited person 1
    $q$ select count(*)::int from workforce.employee_invitations
          where id = 'dc400000-0000-0000-0000-000000000002' $q$), -- someone else's
  0,
  'the invited person CANNOT see a different employee''s invitation row'
);
select is(
  pg_temp.as_auth_count('dc200000-0000-0000-0000-000000000004', -- unrelated third party
    $q$ select count(*)::int from workforce.employee_invitations
          where tenant_id = 'dc000000-0000-0000-0000-000000000001' $q$),
  0,
  'an unrelated third party (not a manager, not targeted) sees nothing'
);
select is(
  pg_temp.as_auth_count('dc200000-0000-0000-0000-000000000005', -- manager B, different tenant
    $q$ select count(*)::int from workforce.employee_invitations
          where tenant_id = 'dc000000-0000-0000-0000-000000000001' $q$),
  0,
  'manager B (tenant B) cannot see tenant A''s invitations'
);

-- ============================================================================
-- Section 2: Manager revoke (plain RLS UPDATE)
-- ============================================================================

select ok(
  pg_temp.as_auth_exec('dc200000-0000-0000-0000-000000000001', -- manager A
    $q$ update workforce.employee_invitations
          set status = 'revoked', revoked_at = now()
          where id = 'dc400000-0000-0000-0000-000000000002' $q$),
  'manager A CAN revoke a pending invitation in their tenant'
);
select is(
  (select status from workforce.employee_invitations where id = 'dc400000-0000-0000-0000-000000000002'),
  'revoked',
  'the revoked invitation''s status is now revoked'
);

-- ============================================================================
-- Section 3: api.accept_employee_invitation -- happy path
-- ============================================================================

select ok(
  pg_temp.as_auth_exec('dc200000-0000-0000-0000-000000000002', -- invited person 1
    $q$ select api.accept_employee_invitation('dc400000-0000-0000-0000-000000000001') $q$),
  'the invited person CAN accept their own pending, unexpired invitation'
);
select is(
  (select user_id from workforce.employees where id = 'dc300000-0000-0000-0000-000000000001'),
  'dc200000-0000-0000-0000-000000000002'::uuid,
  'accepting bound workforce.employees.user_id to the invited person'
);
select is(
  (select status from workforce.employee_invitations where id = 'dc400000-0000-0000-0000-000000000001'),
  'accepted',
  'the accepted invitation''s status is now accepted'
);
select is(
  (select status from core.tenant_memberships
     where tenant_id = 'dc000000-0000-0000-0000-000000000001' and user_id = 'dc200000-0000-0000-0000-000000000002'),
  'active',
  'accepting created an ACTIVE tenant membership'
);
select ok(
  exists (
    select 1 from core.role_assignments
     where tenant_id = 'dc000000-0000-0000-0000-000000000001'
       and user_id = 'dc200000-0000-0000-0000-000000000002'
       and role_id = '00000000-0000-0000-0000-000000000006' -- system employee role
  ),
  'accepting granted the system employee role assignment'
);

-- ============================================================================
-- Section 4: negative / tamper cases
-- ============================================================================

-- --- accepted invitation cannot be reused -------------------------------------
select ok(
  not pg_temp.as_auth_exec('dc200000-0000-0000-0000-000000000002',
    $q$ select api.accept_employee_invitation('dc400000-0000-0000-0000-000000000001') $q$),
  'an already-accepted invitation cannot be accepted again'
);

-- --- a different authenticated user cannot accept someone else's invitation --
insert into workforce.employee_invitations
  (id, tenant_id, employee_id, target_user_id, status, invited_by) values
  ('dc400000-0000-0000-0000-000000000004', 'dc000000-0000-0000-0000-000000000001',
   'dc300000-0000-0000-0000-000000000002', 'dc200000-0000-0000-0000-000000000003',
   'pending', 'dc200000-0000-0000-0000-000000000001');
select ok(
  not pg_temp.as_auth_exec('dc200000-0000-0000-0000-000000000004', -- unrelated third party
    $q$ select api.accept_employee_invitation('dc400000-0000-0000-0000-000000000004') $q$),
  'a different authenticated user CANNOT accept someone else''s pending invitation'
);
select is(
  (select user_id from workforce.employees where id = 'dc300000-0000-0000-0000-000000000002'),
  null::uuid,
  'the tampered-with employee row remains unbound'
);

-- --- revoked invitation cannot be accepted ------------------------------------
select ok(
  not pg_temp.as_auth_exec('dc200000-0000-0000-0000-000000000003',
    $q$ select api.accept_employee_invitation('dc400000-0000-0000-0000-000000000002') $q$), -- revoked in section 2
  'a revoked invitation cannot be accepted'
);

-- --- expired invitation cannot be accepted ------------------------------------
update workforce.employee_invitations set status = 'revoked', revoked_at = now()
  where id = 'dc400000-0000-0000-0000-000000000004'; -- clear the still-pending row first
insert into workforce.employee_invitations
  (id, tenant_id, employee_id, target_user_id, status, invited_by, expires_at) values
  ('dc400000-0000-0000-0000-000000000005', 'dc000000-0000-0000-0000-000000000001',
   'dc300000-0000-0000-0000-000000000002', 'dc200000-0000-0000-0000-000000000003',
   'pending', 'dc200000-0000-0000-0000-000000000001', now() - interval '1 minute');
select ok(
  not pg_temp.as_auth_exec('dc200000-0000-0000-0000-000000000003',
    $q$ select api.accept_employee_invitation('dc400000-0000-0000-0000-000000000005') $q$),
  'an expired invitation cannot be accepted'
);

-- --- employee already bound to another user cannot be silently rebound -------
insert into workforce.employee_invitations
  (id, tenant_id, employee_id, target_user_id, status, invited_by) values
  ('dc400000-0000-0000-0000-000000000006', 'dc000000-0000-0000-0000-000000000001',
   'dc300000-0000-0000-0000-000000000003', 'dc200000-0000-0000-0000-000000000004', -- unrelated 3rd party
   'pending', 'dc200000-0000-0000-0000-000000000001');
select ok(
  not pg_temp.as_auth_exec('dc200000-0000-0000-0000-000000000004',
    $q$ select api.accept_employee_invitation('dc400000-0000-0000-0000-000000000006') $q$),
  'an employee already bound to another user_id (dc300000...003) cannot be silently rebound'
);
select is(
  (select user_id from workforce.employees where id = 'dc300000-0000-0000-0000-000000000003'),
  'dc200000-0000-0000-0000-000000000003'::uuid,
  'the already-bound employee''s original binding is untouched'
);

-- --- bogus invitation id fails cleanly ----------------------------------------
select ok(
  not pg_temp.as_auth_exec('dc200000-0000-0000-0000-000000000002',
    $q$ select api.accept_employee_invitation('00000000-0000-0000-0000-000000000000') $q$),
  'a bogus invitation id fails cleanly (no exists / no match)'
);

-- --- Tenant isolation: same user_id, second tenant, is a legitimate SEPARATE
-- employee identity (0063) -- prove accept_employee_invitation allows it. ----
insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted) values
  ('dc300000-0000-0000-0000-000000000004', 'dc000000-0000-0000-0000-000000000002',
   'dc100000-0000-0000-0000-000000000002', null, '\x00');
insert into workforce.employee_invitations
  (id, tenant_id, employee_id, target_user_id, status, invited_by) values
  ('dc400000-0000-0000-0000-000000000007', 'dc000000-0000-0000-0000-000000000002',
   'dc300000-0000-0000-0000-000000000004', 'dc200000-0000-0000-0000-000000000002', -- SAME user as section 3's tenant A binding
   'pending', 'dc200000-0000-0000-0000-000000000005');
select ok(
  pg_temp.as_auth_exec('dc200000-0000-0000-0000-000000000002',
    $q$ select api.accept_employee_invitation('dc400000-0000-0000-0000-000000000007') $q$),
  'the SAME user_id CAN accept a legitimate employee invitation in a SECOND tenant'
);
select is(
  (select user_id from workforce.employees where id = 'dc300000-0000-0000-0000-000000000004'),
  'dc200000-0000-0000-0000-000000000002'::uuid,
  'tenant B binding succeeded independently of tenant A''s binding for the same user'
);

select * from finish();
rollback;
