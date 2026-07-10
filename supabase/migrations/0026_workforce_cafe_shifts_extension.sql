-- ============================================================================
-- 0026  Workforce Cafe v0.1: extend workforce.shifts + tighten RLS (Slice 1A)
-- ----------------------------------------------------------------------------
-- workforce.shifts (0009_workforce.sql) is extended in place, never renamed
-- and never edited in its original migration, per this slice's confirmed
-- decisions. Two additions:
--   * shift_type_id: nullable uuid, composite tenant-safe FK to the new
--     workforce.shift_types(tenant_id, id) (0025). Nullable because a manager
--     can still create an ad-hoc one-off shift with no named template.
--   * break_minutes: plain integer, default 0 -- an editable override
--     independent of whatever break_minutes the linked shift_type carries (a
--     manager may shorten/extend a specific day's break without editing the
--     shared template).
--
-- RLS tightening (this slice's confirmed decisions #9/#10): the historical
-- wf_shifts_read policy (0009) let ANY workforce.shift.read holder -- staff
-- included, since the `employee` system role holds shift.read (0008_rbac_seed.sql)
-- -- see every shift regardless of `published`, i.e. drafts too. That is
-- replaced by two narrower policies:
--   * wf_shifts_select_published: shift.read holders see published = true
--     rows only (staff).
--   * wf_shifts_manage: shift.write holders keep full `for all` access
--     (select/insert/update/delete, draft + published) -- managers already
--     hold shift.read too, so this policy alone is sufficient for their read
--     access; it is not narrowed to insert/update/delete only.
-- Cross-tenant and anon/no-JWT denial both fall out of core.has_permission's
-- existing tenant-match + core.current_user_id() null-for-anon behavior --
-- no new predicate is needed for either.
-- ============================================================================

alter table workforce.shifts
  add column if not exists shift_type_id uuid,
  add column if not exists break_minutes integer not null default 0;

alter table workforce.shifts
  add constraint shifts_break_minutes_check check (break_minutes >= 0);

alter table workforce.shifts
  add constraint shifts_shift_type_tenant_fkey
    foreign key (tenant_id, shift_type_id)
      references workforce.shift_types(tenant_id, id);

comment on column workforce.shifts.shift_type_id is
  'Optional link to a named workforce.shift_types template (composite tenant-safe FK). Null for ad-hoc one-off shifts.';
comment on column workforce.shifts.break_minutes is
  'Per-occurrence break override in minutes, independent of the linked shift_type''s own break_minutes.';

-- RLS -------------------------------------------------------------------------
drop policy if exists wf_shifts_read on workforce.shifts;
drop policy if exists wf_shifts_write on workforce.shifts;

create policy wf_shifts_select_published on workforce.shifts
  for select
  using (
    published = true
    and core.has_permission(tenant_id, 'workforce.shift.read', location_id)
  );

create policy wf_shifts_manage on workforce.shifts
  for all
  using (core.has_permission(tenant_id, 'workforce.shift.write', location_id))
  with check (core.has_permission(tenant_id, 'workforce.shift.write', location_id));

-- Grants ------------------------------------------------------------------
-- First direct-DB grant of any kind on workforce.shifts to authenticated
-- (0023's facade deliberately excluded it -- see that migration's header).
-- Required for the RLS policies above to engage at all.
grant select, insert, update on workforce.shifts to authenticated;
