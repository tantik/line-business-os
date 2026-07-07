-- ============================================================================
-- 0020  Workforce: staff profile extension + staff.* permissions (Phase 1L-1)
-- ----------------------------------------------------------------------------
-- Extends the existing workforce.employees table (0009_workforce.sql,
-- immutable, not edited here) with staff-profile fields and adds the
-- workforce.staff.read / workforce.staff.manage permission keys.
--
-- Scope note: this migration changes schema + the permission catalog only.
-- employees' existing RLS policies (wf_employees_read/write, keyed to
-- workforce.shift.read/workforce.shift.write) are NOT touched here -- rewiring
-- them to the new staff.* permissions is Phase 1L-2 work. Zero behavior
-- change for any existing caller.
-- ============================================================================

-- position already stores the free-text business position (e.g. 店長,
-- バリスタ, キッチン, ホールスタッフ). Renaming avoids introducing a second,
-- overlapping column under a new name (the CTO correction this satisfies:
-- avoid `role_label`, which could be confused with auth roles owner/manager/
-- staff -- but a duplicate column under any name would still be confusing).
alter table workforce.employees rename column position to position_label;
comment on column workforce.employees.position_label is
  'Free-text business position/job title (e.g. 店長, バリスタ, キッチン, ホールスタッフ). Not an access-control role -- see core.role_assignments for that.';

-- Author tracking, extending the project's existing "who decided/reviewed"
-- FK convention (decided_by in workforce.shift_requests/leave_requests,
-- reviewed_by in ai.proposals): nullable uuid references core.users(id), no
-- ON DELETE clause. No project-wide created_by/updated_by pattern existed
-- before this; this is the first table to adopt it for full row authorship.
alter table workforce.employees
  add column created_by uuid references core.users(id),
  add column updated_by uuid references core.users(id);
comment on column workforce.employees.created_by is 'User who created this staff profile row. Nullable: existing/seed rows predate this column.';
comment on column workforce.employees.updated_by is 'User who last edited this staff profile row. Nullable: existing/seed rows predate this column.';

-- Permission catalog ----------------------------------------------------------
insert into core.permissions (key, module, description) values
  ('workforce.staff.read',   'workforce', 'View staff profiles'),
  ('workforce.staff.manage', 'workforce', 'Create / edit staff profiles')
on conflict (key) do update set description = excluded.description, module = excluded.module;

-- Role -> permission mappings (owner/admin/manager get both; employee gets
-- neither -- self-read of one's own profile is a future RLS predicate on
-- employees.user_id = core.current_user_id(), not gated by this permission,
-- which is for viewing/managing *other* staff).
do $$
declare
  r_owner   uuid := '00000000-0000-0000-0000-000000000003';
  r_admin   uuid := '00000000-0000-0000-0000-000000000004';
  r_manager uuid := '00000000-0000-0000-0000-000000000005';
begin
  insert into core.role_permissions (role_id, permission_key) values
    (r_owner,   'workforce.staff.read'),
    (r_owner,   'workforce.staff.manage'),
    (r_admin,   'workforce.staff.read'),
    (r_admin,   'workforce.staff.manage'),
    (r_manager, 'workforce.staff.read'),
    (r_manager, 'workforce.staff.manage')
  on conflict do nothing;
end $$;
