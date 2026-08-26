-- ============================================================================
-- DB test: Workforce module-OFF gating (WP-S5, migration
-- 0097_workforce_module_access_gate.sql)
-- ----------------------------------------------------------------------------
-- Run with:  pnpm exec supabase db reset && pnpm exec supabase test db
--
-- Workforce is the largest-blast-radius domain in this mission. This file
-- proves the full lifecycle (ON -> OFF -> ON again) across every named
-- surface from the mission brief: employees (self/staff/coworker-roster
-- read), shifts/shift_types, shift_requests, attendance, shift_exchanges
-- (+ manager decide path), recipes (+ ingredients), employee_line_links,
-- schedule_settings, staff_messages, employee_invitations (manager-facing
-- vs. deliberately-ungated self/accept path), api.workforce_staff_directory
-- (which restates its own predicate), and the two guarded SECURITY DEFINER
-- permanent-delete functions. Cross-tenant isolation and existing-row
-- preservation are checked at the OFF boundary. Follows 0039/0042/0043's
-- established as_auth_* helper pattern.
-- ============================================================================

begin;

create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public, core, audit, workforce, ai;

select no_plan();

-- --- Helpers ------------------------------------------------------------------
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

create function pg_temp.as_auth_throws(p_sub text, p_sql text)
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  execute p_sql;
  reset role;
  return false;
exception
  when others then
    reset role;
    return true;
end;
$$;

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
  raise notice 'as_auth_exec failed: %', sqlerrm;
  reset role;
  return false;
end;
$$;

create function pg_temp.as_auth_permadelete_employee(p_sub text, p_tenant uuid, p_employee uuid, out deleted boolean, out blocked_by_history boolean)
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  select r.deleted, r.blocked_by_history into deleted, blocked_by_history
    from api.permanently_delete_employee(p_tenant, p_employee) r;
  deleted := coalesce(deleted, false);
  blocked_by_history := coalesce(blocked_by_history, false);
  reset role;
end;
$$;

create function pg_temp.as_auth_permadelete_recipe(p_sub text, p_tenant uuid, p_recipe uuid, out deleted boolean, out blocked_not_archived boolean)
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('app.current_user_id', '', true);
  perform set_config('request.jwt.claim.sub', coalesce(p_sub, ''), true);
  set local role authenticated;
  select r.deleted, r.blocked_not_archived into deleted, blocked_not_archived
    from api.permanently_delete_recipe(p_tenant, p_recipe) r;
  deleted := coalesce(deleted, false);
  blocked_not_archived := coalesce(blocked_not_archived, false);
  reset role;
end;
$$;

-- ============================================================================
-- Fixtures -- Tenant A, one location, Manager + two Staff employees, plus
-- one row on every gated Workforce surface.
-- ============================================================================

insert into core.tenants (id, slug, name) values
  ('a5000000-0000-0000-0000-00000000000a', 'pgtap-wf-gate-tenant', 'pgTAP Workforce Gate Tenant');

-- Workforce starts ON.
insert into core.tenant_modules (tenant_id, module, is_enabled) values
  ('a5000000-0000-0000-0000-00000000000a', 'workforce', true);

insert into core.locations (id, tenant_id, name, timezone) values
  ('a5200000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 'Gate Tenant Location A', 'Asia/Tokyo');

insert into core.users (id, display_name) values
  ('a5900000-0000-0000-0000-000000000001', 'Staff A'),
  ('a5900000-0000-0000-0000-000000000002', 'Staff B'),
  ('a5900000-0000-0000-0000-000000000003', 'Manager A'),
  ('a5900000-0000-0000-0000-000000000004', 'Invited User D');

insert into core.role_assignments (tenant_id, user_id, role_id, location_id) values
  ('a5000000-0000-0000-0000-00000000000a', 'a5900000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000006', 'a5200000-0000-0000-0000-000000000001'), -- employee
  ('a5000000-0000-0000-0000-00000000000a', 'a5900000-0000-0000-0000-000000000002',
   '00000000-0000-0000-0000-000000000006', 'a5200000-0000-0000-0000-000000000001'), -- employee
  ('a5000000-0000-0000-0000-00000000000a', 'a5900000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000005', 'a5200000-0000-0000-0000-000000000001'); -- manager

insert into workforce.employees (id, tenant_id, location_id, user_id, name_encrypted, is_active) values
  ('a5300000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001', 'a5900000-0000-0000-0000-000000000001', '\x00', true),
  ('a5300000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001', 'a5900000-0000-0000-0000-000000000002', '\x00', true),
  ('a5300000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001', null, '\x00', true), -- Employee C: unbound, no history (invite target)
  ('a5300000-0000-0000-0000-000000000005', 'a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001', null, '\x00', true); -- Employee E: unbound, no history (permadelete OFF target)

insert into workforce.shift_types (id, tenant_id, location_id, code, label_ja, starts_at_local, ends_at_local, break_minutes) values
  ('a5400000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001', 'MORNING', 'Morning', '09:00', '17:00', 60);

insert into workforce.shifts (id, tenant_id, location_id, employee_id, shift_type_id, starts_at, ends_at, break_minutes, published) values
  ('a5500000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001',
   'a5300000-0000-0000-0000-000000000001', 'a5400000-0000-0000-0000-000000000001',
   now() + interval '1 day', now() + interval '1 day 8 hours', 60, true);

insert into workforce.shift_requests (tenant_id, location_id, employee_id, work_date, status) values
  ('a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001',
   'a5300000-0000-0000-0000-000000000001', current_date + 2, 'pending');

insert into workforce.attendance (tenant_id, location_id, employee_id, work_date, clock_in) values
  ('a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001',
   'a5300000-0000-0000-0000-000000000001', current_date, now());

insert into workforce.shift_exchanges (id, tenant_id, location_id, shift_id, requester_employee_id, request_kind, status, reason) values
  ('a5600000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001',
   'a5500000-0000-0000-0000-000000000001', 'a5300000-0000-0000-0000-000000000001', 'cancel', 'open', 'Feeling unwell');

insert into workforce.recipes (id, tenant_id, location_id, title_ja, status) values
  ('a5700000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a', null, 'Iced Coffee', 'published'),
  -- Location-scoped (not tenant-wide): workforce.permanently_delete_recipe
  -- (0057, unchanged by WP-S5 besides the module-access pre-check) calls
  -- core.has_permission(tenant_id, 'workforce.recipe.manage', location_id)
  -- unconditionally -- unlike the RLS policies, it never branches to
  -- has_permission_in_tenant for a null location_id -- so a tenant-wide
  -- recipe can never be permanently deleted by a location-scoped manager
  -- (pre-existing 0057 quirk, out of WP-S5's scope, same category as the
  -- 0023/0085 Inventory quirk WP-S3 already documented and declined to fix).
  ('a5700000-0000-0000-0000-000000000002', 'a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001', 'Archived Recipe (ON delete target)', 'archived'),
  ('a5700000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001', 'Archived Recipe (OFF delete target)', 'archived');

insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja) values
  ('a5000000-0000-0000-0000-00000000000a', 'a5700000-0000-0000-0000-000000000001', 'Coffee beans');

insert into workforce.schedule_settings (tenant_id, location_id, required_headcount_by_weekday, max_monthly_hours) values
  ('a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001', '[1,1,1,1,1,1,1]'::jsonb, 160);

insert into workforce.employee_line_links (tenant_id, employee_id, line_user_id_encrypted, line_user_id_hash) values
  ('a5000000-0000-0000-0000-00000000000a', 'a5300000-0000-0000-0000-000000000001', '\x00', 'line-user-a-hash');

insert into workforce.employee_invitations (id, tenant_id, employee_id, target_user_id, invited_by) values
  ('a5800000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-00000000000a',
   'a5300000-0000-0000-0000-000000000003', 'a5900000-0000-0000-0000-000000000004', 'a5900000-0000-0000-0000-000000000003');

-- Tenant B, for cross-tenant isolation.
insert into core.tenants (id, slug, name) values
  ('a5000000-0000-0000-0000-00000000000b', 'pgtap-wf-gate-tenant-b', 'pgTAP Workforce Gate Tenant B');
insert into core.users (id, display_name) values
  ('a5900000-0000-0000-0000-000000000099', 'Tenant B Owner');
insert into core.role_assignments (tenant_id, user_id, role_id) values
  ('a5000000-0000-0000-0000-00000000000b', 'a5900000-0000-0000-0000-000000000099',
   '00000000-0000-0000-0000-000000000003'); -- tenant_owner, tenant-wide

-- ============================================================================
-- Section 1: Workforce ON -- normal baseline behavior across every surface.
-- ============================================================================

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.workforce_my_staff_profile $$),
  1,
  'Workforce ON: staff A sees their own profile (wf_employees_self_read)'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000003',
    $$ select count(*)::int from api.workforce_staff_directory where tenant_id = 'a5000000-0000-0000-0000-00000000000a' $$),
  4,
  'Workforce ON: manager sees the full staff directory (api.workforce_staff_directory)'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000002',
    $$ select count(*)::int from api.workforce_staff_roster where employee_id = 'a5300000-0000-0000-0000-000000000001' $$),
  1,
  'Workforce ON: staff B sees active coworker staff A via api.workforce_staff_roster (is_caller_employee_in_scope)'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.workforce_shift_assignments where employee_id = 'a5300000-0000-0000-0000-000000000001' $$),
  1,
  'Workforce ON: staff A sees their own published shift via api.workforce_shift_assignments'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000002',
    $$ select count(*)::int from api.workforce_shift_assignments where employee_id = 'a5300000-0000-0000-0000-000000000001' $$),
  1,
  'Workforce ON: staff B (active coworker) also sees staff A''s published shift (is_employee_active_for_schedule)'
);

select ok(
  pg_temp.as_auth_exec('a5900000-0000-0000-0000-000000000002',
    $q$insert into workforce.shift_requests (tenant_id, location_id, employee_id, work_date, status)
       values ('a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001',
               'a5300000-0000-0000-0000-000000000002', current_date + 3, 'pending')$q$),
  'Workforce ON: staff B can INSERT their own shift_requests row'
);

select ok(
  pg_temp.as_auth_exec('a5900000-0000-0000-0000-000000000002',
    $q$insert into workforce.attendance (tenant_id, location_id, employee_id, work_date, clock_in)
       values ('a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001',
               'a5300000-0000-0000-0000-000000000002', current_date, now())$q$),
  'Workforce ON: staff B can INSERT their own attendance row'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from workforce.shift_exchanges where id = 'a5600000-0000-0000-0000-000000000001' $$),
  1,
  'Workforce ON: staff A (requester) can read their own open shift_exchange'
);

select ok(
  pg_temp.as_auth_exec('a5900000-0000-0000-0000-000000000003',
    $q$update workforce.shift_exchanges set status = 'cancelled' where id = 'a5600000-0000-0000-0000-000000000001'$q$),
  'Workforce ON: manager can decide (cancel) the shift_exchange via wf_shift_exchanges_manage + guard trigger''s manager branch'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.workforce_recipes where status = 'published' $$),
  1,
  'Workforce ON: staff sees the published recipe'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.workforce_recipe_ingredients where recipe_id = 'a5700000-0000-0000-0000-000000000001' $$),
  1,
  'Workforce ON: staff sees the published recipe''s ingredient'
);

select ok(
  pg_temp.as_auth_exec('a5900000-0000-0000-0000-000000000003',
    $q$insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja)
       values ('a5000000-0000-0000-0000-00000000000a', 'a5700000-0000-0000-0000-000000000001', 'Milk')$q$),
  'Workforce ON: manager (recipe.manage) can INSERT a new ingredient (workforce.can_manage_recipe)'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000002',
    $$ select count(*)::int from workforce.schedule_settings where tenant_id = 'a5000000-0000-0000-0000-00000000000a' $$),
  1,
  'Workforce ON: staff can read schedule_settings'
);

select ok(
  pg_temp.as_auth_exec('a5900000-0000-0000-0000-000000000001',
    $q$insert into api.workforce_staff_messages (tenant_id, location_id, employee_id, sender_role, sender_user_id, body)
       values ('a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001',
               'a5300000-0000-0000-0000-000000000001', 'staff', 'a5900000-0000-0000-0000-000000000001', 'Running late')$q$),
  'Workforce ON: staff A can INSERT into their own Mail thread'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000003',
    $$ select count(*)::int from api.workforce_staff_messages where tenant_id = 'a5000000-0000-0000-0000-00000000000a' $$),
  1,
  'Workforce ON: manager sees the Mail thread'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000003',
    $$ select count(*)::int from api.workforce_employee_invitations where tenant_id = 'a5000000-0000-0000-0000-00000000000a' $$),
  1,
  'Workforce ON: manager sees the pending invitation (wf_employee_invitations_manager_read)'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000004',
    $$ select count(*)::int from api.my_pending_employee_invitations() $$),
  1,
  'Workforce ON: the invited user sees their own pending invitation'
);

select ok(
  pg_temp.as_auth_exec('a5900000-0000-0000-0000-000000000003',
    $q$select api.upsert_employee_invitation(
      'a5000000-0000-0000-0000-00000000000a'::uuid, 'a5300000-0000-0000-0000-000000000003'::uuid,
      'a5900000-0000-0000-0000-000000000004'::uuid, gen_random_uuid())$q$),
  'Workforce ON: manager can Invite/Resend via workforce.upsert_employee_invitation'
);

select is(
  (pg_temp.as_auth_permadelete_recipe('a5900000-0000-0000-0000-000000000003',
    'a5000000-0000-0000-0000-00000000000a', 'a5700000-0000-0000-0000-000000000002')).deleted,
  true,
  'Workforce ON: manager can permanently delete an Archived recipe with no history'
);

select is(
  (pg_temp.as_auth_permadelete_employee('a5900000-0000-0000-0000-000000000003',
    'a5000000-0000-0000-0000-00000000000a', 'a5300000-0000-0000-0000-000000000005')).deleted,
  true,
  'Workforce ON: manager can permanently delete an employee with no history (Employee E)'
);

-- ============================================================================
-- Section 2: Workforce OFF -- tenant-facing access blocked, data preserved.
-- ============================================================================

update core.tenant_modules set is_enabled = false
  where tenant_id = 'a5000000-0000-0000-0000-00000000000a' and module = 'workforce';

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.workforce_my_staff_profile $$),
  0,
  'Workforce OFF: staff A no longer sees their own profile'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000003',
    $$ select count(*)::int from api.workforce_staff_directory where tenant_id = 'a5000000-0000-0000-0000-00000000000a' $$),
  0,
  'Workforce OFF: manager''s staff directory is empty (view''s own restated WHERE, not just base RLS)'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000002',
    $$ select count(*)::int from api.workforce_staff_roster where employee_id = 'a5300000-0000-0000-0000-000000000001' $$),
  0,
  'Workforce OFF: coworker roster is empty (is_caller_employee_in_scope''s own module pre-check)'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from workforce.shifts where tenant_id = 'a5000000-0000-0000-0000-00000000000a' $$),
  0,
  'Workforce OFF: tenant-facing SELECT on workforce.shifts returns zero rows'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000002',
    $$ select count(*)::int from api.workforce_shift_assignments where employee_id = 'a5300000-0000-0000-0000-000000000001' $$),
  0,
  'Workforce OFF: api.workforce_shift_assignments is empty (base RLS + is_employee_active_for_schedule''s own pre-check)'
);

select ok(
  pg_temp.as_auth_throws('a5900000-0000-0000-0000-000000000002',
    $q$insert into workforce.shift_requests (tenant_id, location_id, employee_id, work_date, status)
       values ('a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001',
               'a5300000-0000-0000-0000-000000000002', current_date + 4, 'pending')$q$),
  'Workforce OFF: staff B cannot INSERT a new shift_requests row'
);

select ok(
  pg_temp.as_auth_throws('a5900000-0000-0000-0000-000000000002',
    $q$insert into workforce.attendance (tenant_id, location_id, employee_id, work_date, clock_in)
       values ('a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001',
               'a5300000-0000-0000-0000-000000000002', current_date + 1, now())$q$),
  'Workforce OFF: staff B cannot INSERT a new attendance row'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from workforce.shift_exchanges where tenant_id = 'a5000000-0000-0000-0000-00000000000a' $$),
  0,
  'Workforce OFF: staff A cannot read the shift_exchanges row anymore'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.workforce_recipes where status = 'published' $$),
  0,
  'Workforce OFF: staff no longer sees the published recipe'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.workforce_recipe_ingredients where recipe_id = 'a5700000-0000-0000-0000-000000000001' $$),
  0,
  'Workforce OFF: staff no longer sees the recipe''s ingredients'
);

select ok(
  pg_temp.as_auth_throws('a5900000-0000-0000-0000-000000000003',
    $q$insert into workforce.recipe_ingredients (tenant_id, recipe_id, label_ja)
       values ('a5000000-0000-0000-0000-00000000000a', 'a5700000-0000-0000-0000-000000000001', 'Blocked ingredient')$q$),
  'Workforce OFF: manager cannot INSERT a new recipe ingredient'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000002',
    $$ select count(*)::int from workforce.schedule_settings where tenant_id = 'a5000000-0000-0000-0000-00000000000a' $$),
  0,
  'Workforce OFF: staff no longer sees schedule_settings'
);

select ok(
  pg_temp.as_auth_throws('a5900000-0000-0000-0000-000000000001',
    $q$insert into api.workforce_staff_messages (tenant_id, location_id, employee_id, sender_role, sender_user_id, body)
       values ('a5000000-0000-0000-0000-00000000000a', 'a5200000-0000-0000-0000-000000000001',
               'a5300000-0000-0000-0000-000000000001', 'staff', 'a5900000-0000-0000-0000-000000000001', 'Blocked message')$q$),
  'Workforce OFF: staff A cannot INSERT a new Mail message'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000003',
    $$ select count(*)::int from api.workforce_staff_messages where tenant_id = 'a5000000-0000-0000-0000-00000000000a' $$),
  0,
  'Workforce OFF: manager no longer sees the Mail thread'
);

-- Employee invitations: deliberate split -- manager-facing gated, self/accept
-- deliberately NOT gated (see 0097's header).
select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000003',
    $$ select count(*)::int from api.workforce_employee_invitations where tenant_id = 'a5000000-0000-0000-0000-00000000000a' $$),
  0,
  'Workforce OFF: manager no longer sees the pending invitation (wf_employee_invitations_manager_read gated)'
);

select ok(
  pg_temp.as_auth_throws('a5900000-0000-0000-0000-000000000003',
    $q$select api.upsert_employee_invitation(
      'a5000000-0000-0000-0000-00000000000a'::uuid, 'a5300000-0000-0000-0000-000000000003'::uuid,
      'a5900000-0000-0000-0000-000000000004'::uuid, gen_random_uuid())$q$),
  'Workforce OFF: manager cannot Invite/Resend via workforce.upsert_employee_invitation (explicit module pre-check)'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000004',
    $$ select count(*)::int from api.my_pending_employee_invitations() $$),
  1,
  'Workforce OFF: the invited user STILL sees their own pending invitation (deliberately ungated self-read)'
);

select ok(
  pg_temp.as_auth_exec('a5900000-0000-0000-0000-000000000004',
    $q$select api.accept_employee_invitation('a5800000-0000-0000-0000-000000000001'::uuid)$q$),
  'Workforce OFF: the invited user CAN still accept their invitation (deliberately ungated onboarding path)'
);

select is(
  (pg_temp.as_auth_permadelete_recipe('a5900000-0000-0000-0000-000000000003',
    'a5000000-0000-0000-0000-00000000000a', 'a5700000-0000-0000-0000-000000000003')).deleted,
  false,
  'Workforce OFF: permanently_delete_recipe refuses (explicit module-access pre-check, before status/permission checks)'
);

select is(
  (pg_temp.as_auth_permadelete_employee('a5900000-0000-0000-0000-000000000003',
    'a5000000-0000-0000-0000-00000000000a', 'a5300000-0000-0000-0000-000000000003')).deleted,
  false,
  'Workforce OFF: permanently_delete_employee refuses (explicit module-access pre-check, before manage-permission/history checks)'
);

-- Existing rows preserved: verified via a superuser/RLS-bypassing read.
select is(
  (select count(*)::int from workforce.employees where tenant_id = 'a5000000-0000-0000-0000-00000000000a'),
  3,
  'Workforce OFF: all 3 remaining employee rows (Employee E was permanently deleted in Section 1) still exist in storage'
);
select is(
  (select count(*)::int from workforce.shifts where tenant_id = 'a5000000-0000-0000-0000-00000000000a'),
  1,
  'Workforce OFF: the pre-existing shift row still exists in storage'
);
select is(
  (select count(*)::int from workforce.recipes where tenant_id = 'a5000000-0000-0000-0000-00000000000a' and status = 'published'),
  1,
  'Workforce OFF: the published recipe row still exists in storage'
);
select is(
  (select count(*)::int from workforce.staff_messages where tenant_id = 'a5000000-0000-0000-0000-00000000000a'),
  1,
  'Workforce OFF: the pre-existing Mail message still exists in storage'
);

-- Cross-tenant isolation, still holding regardless of module state.
select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000099',
    $$ select count(*)::int from workforce.employees where tenant_id = 'a5000000-0000-0000-0000-00000000000a' $$),
  0,
  'Tenant B owner sees zero Tenant A workforce.employees rows (tenant isolation)'
);

-- Staff privilege escalation: a plain employee (no staff.manage) still cannot
-- read the full directory even with module ON conceptually restored later --
-- checked here as a negative control while OFF, and re-checked ON below.
select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.workforce_staff_directory $$),
  0,
  'Workforce OFF: plain Staff (no staff.read/.manage) still cannot see the directory either way'
);

-- ============================================================================
-- Section 3: Workforce ON again -- prior data/actions accessible again.
-- ============================================================================

update core.tenant_modules set is_enabled = true
  where tenant_id = 'a5000000-0000-0000-0000-00000000000a' and module = 'workforce';

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.workforce_my_staff_profile $$),
  1,
  'Workforce ON again: staff A sees their own profile again'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000003',
    $$ select count(*)::int from api.workforce_staff_directory where tenant_id = 'a5000000-0000-0000-0000-00000000000a' $$),
  3,
  'Workforce ON again: manager sees the full staff directory again (3 remaining employees, including Employee C now bound via the accepted invitation)'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000003',
    $$ select count(*)::int from api.workforce_staff_messages where tenant_id = 'a5000000-0000-0000-0000-00000000000a' $$),
  1,
  'Workforce ON again: manager sees the same pre-existing Mail thread again'
);

select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.workforce_recipes where status = 'published' $$),
  1,
  'Workforce ON again: staff sees the published recipe again'
);

-- Staff (plain employee role, no staff.manage) never gained directory access
-- via module state alone -- permission and module access are independent
-- ANDed layers, neither substitutes for the other.
select is(
  pg_temp.as_auth_count('a5900000-0000-0000-0000-000000000001',
    $$ select count(*)::int from api.workforce_staff_directory $$),
  0,
  'Workforce ON again: plain Staff still cannot see the directory (permission layer still independently enforced)'
);

select * from finish();
rollback;
