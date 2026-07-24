-- ============================================================================
-- 0032 Workforce: actual attendance break + instruction knowledge content
-- ============================================================================
-- Additive extension for two reusable Workforce capabilities:
--   1. staff records the actual break duration when confirming clock-out;
--   2. recipe/manual content has an explicit recipe/instruction kind.
--
-- No RLS policy or base-table grant is widened. The existing attendance and
-- recipe policies remain the authorization boundary. The api views stay
-- SECURITY INVOKER and expose only the two new non-PII fields.

alter table workforce.attendance
  add column if not exists actual_break_minutes integer not null default 0;

alter table workforce.attendance
  add constraint attendance_actual_break_minutes_check
    check (actual_break_minutes between 0 and 480);

comment on column workforce.attendance.actual_break_minutes is
  'Actual staff-reported break duration for this attendance row. Distinct from planned workforce.shifts.break_minutes.';

alter table workforce.recipes
  add column if not exists content_kind text not null default 'recipe';

alter table workforce.recipes
  add constraint recipes_content_kind_check
    check (content_kind in ('recipe', 'instruction'));

comment on column workforce.recipes.content_kind is
  'recipe | instruction. Instruction content is operational guidance and sorts before ordinary recipes for staff.';

create index if not exists wf_recipes_tenant_kind_status_idx
  on workforce.recipes(tenant_id, content_kind, status, is_popular);

create or replace view api.workforce_attendance
  with (security_invoker = true) as
select
  a.id as attendance_id,
  a.tenant_id,
  a.location_id,
  a.employee_id,
  a.shift_id,
  a.work_date,
  a.clock_in,
  a.clock_out,
  a.status,
  a.transportation_cost,
  a.daily_message,
  a.created_at,
  a.updated_at,
  a.actual_break_minutes
from workforce.attendance a;

comment on view api.workforce_attendance is
  'Attendance records including actual break duration, relying entirely on existing manager/self RLS. security_invoker view.';

create or replace view api.workforce_recipes
  with (security_invoker = true) as
select
  r.id as recipe_id,
  r.tenant_id,
  r.location_id,
  r.recipe_category_id,
  r.title_ja,
  r.title_en,
  r.description_ja,
  r.description_en,
  r.is_popular,
  r.status,
  r.created_at,
  r.updated_at,
  r.content_kind
from workforce.recipes r;

comment on view api.workforce_recipes is
  'Published recipe and instruction knowledge content. Existing recipe RLS remains authoritative. security_invoker view.';

grant select, insert, update on api.workforce_attendance to authenticated;
grant select on api.workforce_recipes to authenticated;
revoke all on api.workforce_attendance from anon, public;
revoke all on api.workforce_recipes from anon, public;
