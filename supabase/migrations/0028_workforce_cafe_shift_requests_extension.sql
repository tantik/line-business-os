-- ============================================================================
-- 0028  Workforce Cafe v0.1: extend workforce.shift_requests (Slice 1A)
-- ----------------------------------------------------------------------------
-- workforce.shift_requests (0009_workforce.sql) is extended in place, never
-- renamed, and reused for both shift preferences AND correction requests for
-- v0.1 (this slice's confirmed decisions #3/#4) rather than adding two new
-- tables. `kind` (existing, free text, no check constraint) gains two new
-- values used by a later slice's Server Actions: 'preference' and
-- 'correction' -- no schema change needed for that, since `kind` was never
-- constrained to swap|pickup|drop, only defaulted to 'swap'.
--
-- New columns:
--   * work_date: NOT NULL. Every preference/correction request is inherently
--     about one calendar day, unlike the historical swap/pickup/drop kinds
--     which resolve their date via shift_id -- this column is what lets a
--     preference/correction be recorded even when there is no existing
--     workforce.shifts row yet for that day (e.g. "I'd like next Tuesday
--     off," submitted before any shift is scheduled for that Tuesday).
--   * shift_type_id: nullable, composite tenant-safe FK to
--     workforce.shift_types(tenant_id, id) (0025) -- which template the staff
--     member is requesting/reporting against.
--   * is_unavailable: staff marking a date as unavailable (the demo's `休暇`
--     cell), independent of shift_type_id.
--   * attendance_id: nullable, composite tenant-safe FK to
--     workforce.attendance(tenant_id, id) (0027 added the unique(tenant_id,
--     id) this needs) -- links a correction request to the specific
--     attendance row it is correcting. Null for preference requests, which
--     have no attendance row yet.
--
-- Partial unique index: at most one 'preference'-kind request per employee
-- per work_date -- a new submission for the same day must update/replace the
-- existing pending one, not create a duplicate. Deliberately scoped to
-- `kind = 'preference'` only: correction requests legitimately may have
-- multiple rows against the same work_date over time (a rejected correction
-- followed by a re-submission), so no such constraint applies there.
--
-- RLS: staff previously had ZERO write access to this table (0009's single
-- wf_shift_requests_write policy is keyed to workforce.request.manage, which
-- the `employee` system role never held), and the historical
-- wf_shift_requests_read policy was keyed to workforce.shift.read -- which
-- the `employee` system role DOES hold, so any staff member could already
-- read every OTHER employee's shift requests (preference submissions,
-- correction messages) at their location, not just their own. That is the
-- same class of self-scope gap 0027 fixed on workforce.attendance, so it is
-- fixed here the same way: wf_shift_requests_read is dropped and replaced by
-- a self-scope SELECT policy (own rows only). Two self-scope policies are
-- added, both keyed to workforce.is_own_employee (0027):
--   * SELECT: a staff member reads only their own requests.
--   * INSERT: a staff member may create only their own requests, and the
--     WITH CHECK forces status = 'pending' and decided_by is null -- a staff
--     member can submit a request but can never insert a pre-decided one.
-- wf_shift_requests_write (workforce.request.manage -- managers' full
-- read/decide path) is left exactly as 0009 defined it and is not touched by
-- this migration ("manager request.manage policies remain," per this slice's
-- task brief) -- it alone now provides every manager-side read, since the
-- broad staff-wide read policy is gone.
-- ============================================================================

alter table workforce.shift_requests
  add column if not exists work_date date,
  add column if not exists shift_type_id uuid,
  add column if not exists is_unavailable boolean not null default false,
  add column if not exists attendance_id uuid;

-- Backfilled as a separate step (not a column default) because there is no
-- meaningful default date for the historical swap/pickup/drop kinds; at
-- migration-apply time this table has no rows in any environment this slice
-- targets (a fresh `supabase db reset`), so the NOT NULL below never has an
-- existing row to violate. If a future environment already has rows, this
-- statement is a no-op update over zero matching rows before the constraint
-- is added -- i.e. it fails loudly rather than silently corrupting dates.
alter table workforce.shift_requests
  alter column work_date set not null;

alter table workforce.shift_requests
  add constraint shift_requests_shift_type_tenant_fkey
    foreign key (tenant_id, shift_type_id)
      references workforce.shift_types(tenant_id, id);

alter table workforce.shift_requests
  add constraint shift_requests_attendance_tenant_fkey
    foreign key (tenant_id, attendance_id)
      references workforce.attendance(tenant_id, id);

comment on column workforce.shift_requests.work_date is
  'Calendar date this request concerns. Required for every kind, including historical swap/pickup/drop.';
comment on column workforce.shift_requests.shift_type_id is
  'Optional link to the requested/reported workforce.shift_types template.';
comment on column workforce.shift_requests.is_unavailable is
  'Staff marking work_date as unavailable (independent of shift_type_id).';
comment on column workforce.shift_requests.attendance_id is
  'Optional link to the workforce.attendance row a correction request (kind = ''correction'') is about. Null for preference requests.';

create unique index if not exists wf_shift_requests_one_preference_per_day
  on workforce.shift_requests (tenant_id, employee_id, work_date)
  where kind = 'preference';

-- RLS -------------------------------------------------------------------------
drop policy if exists wf_shift_requests_read on workforce.shift_requests;

create policy wf_shift_requests_self_select on workforce.shift_requests
  for select
  using (workforce.is_own_employee(employee_id));

create policy wf_shift_requests_self_insert on workforce.shift_requests
  for insert
  with check (
    workforce.is_own_employee(employee_id)
    and status = 'pending'
    and decided_by is null
  );

-- Grants ------------------------------------------------------------------
-- First direct-DB grant of any kind on workforce.shift_requests to
-- authenticated. Required for the (existing + new) RLS policies above to
-- engage at all.
grant select, insert, update on workforce.shift_requests to authenticated;
